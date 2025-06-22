// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

const { log } = require('common-util');
const crypto = require('crypto');
const inboundHelper = require('../inboundHelper');
const CHANNEL_TYPE = 'WECHAT';
const AWS = require('aws-sdk');
const secretManager = new AWS.SecretsManager();

const handler = async (messagePayloadString) => {
  log.debug('WeChat message handler');

  const messagePayload = JSON.parse(messagePayloadString);

  await processMessagePayload(messagePayload);
};

const processMessagePayload = async (messagePayload) => {
  const vendorIdParticipantMap = {};
  
  // WeChat webhook event structure
  if (!messagePayload.MsgType) {
    log.warn('Unsupported WeChat event - no MsgType found');
    return;
  }

  // Get the sender ID from the WeChat payload
  const vendorId = messagePayload.FromUserName;
  
  // Get or create participant for this sender
  await inboundHelper
    .getOrCreateParticipant(CHANNEL_TYPE, vendorId)
    .then((participant) => {
      vendorIdParticipantMap[vendorId] = participant;
    });

  log.debug('vendor id participant map', vendorIdParticipantMap);

  // Process the message
  const participant = vendorIdParticipantMap[vendorId];
  
  await processMessage(messagePayload, participant);
};

const processMessage = async (message, participant) => {
  if (message === undefined) {
    log.warn('Undefined message');
    return;
  }

  // Support regular text based message
  if (message.MsgType === 'text' && message.Content !== undefined) {
    await inboundHelper.sendMessage(participant, message.Content);
  } 
  // Support image messages
  else if (message.MsgType === 'image') {
    const attachmentMessage = `User sent an image: ${message.MediaId}`;
    await inboundHelper.sendMessage(participant, attachmentMessage);
  }
  // Support voice messages
  else if (message.MsgType === 'voice') {
    const attachmentMessage = `User sent a voice message: ${message.MediaId}`;
    await inboundHelper.sendMessage(participant, attachmentMessage);
  }
  // Support video messages
  else if (message.MsgType === 'video') {
    const attachmentMessage = `User sent a video: ${message.MediaId}`;
    await inboundHelper.sendMessage(participant, attachmentMessage);
  }
  else {
    log.warn('Unsupported message type detected.', message.MsgType);
  }
};

let appSecret = undefined;
const validateRequest = async (request) => {
  if (appSecret === undefined) {
    await getWechatSecrets();
  }

  if (appSecret === null) {
    log.error('WeChat Secret not found. Cannot process record.');
    return false;
  }

  const signature = request.headers['x-wechat-signature'];

  if (signature === undefined) {
    log.warn('No signature found. Request invalid.');
    return false;
  }

  // Validate the signature according to WeChat's documentation
  const payloadHash = crypto
    .createHmac('sha256', appSecret)
    .update(request.body)
    .digest('hex');

  if (signature === payloadHash) {
    log.debug('WeChat Request Validation - Hash match');
    return true;
  } else {
    log.debug('WeChat Request Validation - Hash does not match');
    return false;
  }
};

const getWechatSecrets = async () => {
  if(process.env.WECHAT_SECRET){
    const params = {
      SecretId: process.env.WECHAT_SECRET
    }
    const response = await secretManager.getSecretValue(params).promise();
    appSecret = JSON.parse(response.SecretString).APP_SECRET
  } else {
    appSecret = null;
  }
};

module.exports = { handler, validateRequest };