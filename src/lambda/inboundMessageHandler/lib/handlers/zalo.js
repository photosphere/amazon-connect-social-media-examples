// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

const { log } = require('common-util');
const crypto = require('crypto');
const inboundHelper = require('../inboundHelper');
const CHANNEL_TYPE = 'ZALO';
const AWS = require('aws-sdk');
const secretManager = new AWS.SecretsManager();

const handler = async (messagePayloadString) => {
  log.debug('Zalo message handler');

  const messagePayload = JSON.parse(messagePayloadString);

  await processMessagePayload(messagePayload);
};

const processMessagePayload = async (messagePayload) => {
  const vendorIdParticipantMap = {};
  
  // Zalo webhook event structure
  // Reference: https://developers.zalo.me/docs/api/official-account-api/webhook/receiving-events-from-users-v3
  if (!messagePayload.event_name || messagePayload.event_name !== 'user_send_text') {
    log.warn('Unsupported Zalo event type:', messagePayload.event_name);
    return;
  }

  // Get the sender ID from the Zalo payload
  const vendorId = messagePayload.sender.id;
  
  // Get or create participant for this sender
  await inboundHelper
    .getOrCreateParticipant(CHANNEL_TYPE, vendorId)
    .then((participant) => {
      vendorIdParticipantMap[vendorId] = participant;
    });

  log.debug('vendor id participant map', vendorIdParticipantMap);

  // Process the message
  const participant = vendorIdParticipantMap[vendorId];
  
  if (messagePayload.message) {
    await processMessage(messagePayload.message, participant);
  } else {
    log.warn('No message content found in Zalo payload');
  }
};

const processMessage = async (message, participant) => {
  if (message === undefined) {
    log.warn('Undefined message');
    return;
  }

  // Support regular text based message
  if (message.text !== undefined) {
    await inboundHelper.sendMessage(participant, message.text);
  } 
  // Support attachments (images, files, etc.)
  else if (message.attachments !== undefined) {
    log.debug('Attachments found', message.attachments);

    for (let i = 0; i < message.attachments.length; i++) {
      const attachment = message.attachments[i];
      let attachmentMessage;
      
      switch (attachment.type) {
        case 'image':
          attachmentMessage = `User sent an image: ${attachment.payload.url}`;
          break;
        case 'file':
          attachmentMessage = `User sent a file: ${attachment.payload.url}`;
          break;
        case 'audio':
          attachmentMessage = `User sent an audio message: ${attachment.payload.url}`;
          break;
        case 'video':
          attachmentMessage = `User sent a video: ${attachment.payload.url}`;
          break;
        default:
          log.warn(
            `Zalo attachment type "${attachment.type}" not supported.`
          );
          continue;
      }

      await inboundHelper.sendMessage(participant, attachmentMessage);
    }
  } else {
    log.warn('Unsupported message detected.', message);
  }
};

let appSecret = undefined;
const validateRequest = async (request) => {
  if (appSecret === undefined) {
    await getZaloSecrets();
  }

  if (appSecret === null) {
    log.error('Zalo Secret not found. Cannot process record.');
    return false;
  }

  const signature = request.headers['x-zalo-signature'];

  if (signature === undefined) {
    log.warn('No signature found. Request invalid.');
    return false;
  }

  // Validate the signature according to Zalo's documentation
  // https://developers.zalo.me/docs/api/official-account-api/webhook/setup-webhook-v3
  const payloadHash = crypto
    .createHmac('sha256', appSecret)
    .update(request.body)
    .digest('hex');

  if (signature === payloadHash) {
    log.debug('Zalo Request Validation - Hash match');
    return true;
  } else {
    log.debug('Zalo Request Validation - Hash does not match');
    return false;
  }
};

const getZaloSecrets = async () => {
  if(process.env.ZALO_SECRET){
    const params = {
      SecretId: process.env.ZALO_SECRET
    }
    const response = await secretManager.getSecretValue(params).promise();
    appSecret = JSON.parse(response.SecretString).APP_SECRET
  } else {
    appSecret = null;
  }
};

module.exports = { handler, validateRequest };