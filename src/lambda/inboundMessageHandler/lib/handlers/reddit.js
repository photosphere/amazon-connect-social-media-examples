// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

const { log } = require('common-util');
const crypto = require('crypto');
const inboundHelper = require('../inboundHelper');
const CHANNEL_TYPE = 'REDDIT';
const AWS = require('aws-sdk');
const secretManager = new AWS.SecretsManager();

const handler = async (messagePayloadString) => {
  log.debug('Reddit message handler');

  const messagePayload = JSON.parse(messagePayloadString);

  await processMessagePayload(messagePayload);
};

const processMessagePayload = async (messagePayload) => {
  const vendorIdParticipantMap = {};

  // Reddit private messages are delivered as a "Listing" of message ("t4")
  // objects. A relay/poller forwards the inbox listing to this webhook.
  // Reference: https://www.reddit.com/dev/api/#GET_message_inbox
  const messages = getRedditMessages(messagePayload);

  if (messages.length === 0) {
    log.info('Ignoring Reddit event, no private messages found in payload');
    return;
  }

  // Get or create a participant for each unique sender (Reddit username)
  for (const message of messages) {
    // Skip comment replies / mentions - only support direct private messages
    if (message.was_comment === true) {
      log.info('Ignoring Reddit comment reply, only private messages supported');
      continue;
    }

    const vendorId = getVendorId(message);

    if (vendorId === undefined || vendorId === null) {
      log.warn('Reddit message missing author, skipping', message);
      continue;
    }

    await inboundHelper
      .getOrCreateParticipant(CHANNEL_TYPE, vendorId)
      .then((participant) => {
        vendorIdParticipantMap[vendorId] = participant;
      });

    await processMessage(message, vendorIdParticipantMap[vendorId]);
  }
};

const processMessage = async (message, participant) => {
  if (message === undefined) {
    log.warn('Undefined message');
    return;
  }

  // Reddit messages are plain text/markdown in the "body" field
  if (message.body !== undefined && message.body !== '') {
    await inboundHelper.sendMessage(participant, message.body);
  } else {
    log.warn('Unsupported Reddit message detected.', message);
  }
};

// Normalize the Reddit inbox payload into a flat array of message objects.
// Supports both a raw Listing and a single message object.
const getRedditMessages = (messagePayload) => {
  if (
    messagePayload &&
    messagePayload.kind === 'Listing' &&
    messagePayload.data &&
    Array.isArray(messagePayload.data.children)
  ) {
    return messagePayload.data.children
      .map((child) => (child && child.data ? child.data : null))
      .filter((data) => data !== null);
  }

  // Single message object (e.g. forwarded individually)
  if (messagePayload && messagePayload.body !== undefined) {
    return [messagePayload];
  }

  return [];
};

const getVendorId = (message) => {
  return message.author;
};

let appSecret = undefined;
const validateRequest = async (request) => {
  if (appSecret === undefined) {
    await getRedditSecrets();
  }

  if (appSecret === null) {
    log.error('Reddit Secret not found. Cannot process record.');
    return false;
  }

  const signature = request.headers['x-hub-signature-256'];

  if (signature === undefined) {
    log.warn('No signature found. Request invalid.');
    return false;
  }
  const requestHash = signature.split('=')[1];

  const payloadHash = crypto
    .createHmac('sha256', appSecret)
    .update(request.body)
    .digest('hex');

  if (requestHash === payloadHash) {
    log.debug('Reddit Request Validation - Hash match');
    return true;
  } else {
    log.debug('Reddit Request Validation - Hash does not match');
    return false;
  }
};

const getRedditSecrets = async () => {
  if (process.env.REDDIT_SECRET) {
    const params = {
      SecretId: process.env.REDDIT_SECRET,
    };
    const response = await secretManager.getSecretValue(params).promise();
    appSecret = JSON.parse(response.SecretString).REDDIT_APP_SECRET;
  } else {
    appSecret = null;
  }
};

module.exports = { handler, validateRequest };
