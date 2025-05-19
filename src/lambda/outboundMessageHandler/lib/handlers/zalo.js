// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

const https = require('https');
const AWS = require('aws-sdk');
const { log } = require('common-util');

const PATH = '/v2.0/oa/message';
let accessToken = undefined;
let appSecret = undefined;

const secretManager = new AWS.SecretsManager();

const handler = async (zaloId, message) => {
  if (message.Type === 'EVENT') {
    log.debug('Ignoring event message', message);
    return;
  }

  if (accessToken === undefined || appSecret === undefined) {
    await getZaloSecrets();
  }

  if (accessToken === null) {
    log.error('Access token not found');
    return false;
  }

  return await sendMessage(zaloId, message);
};

const sendMessage = async (zaloId, message) => {
  // Zalo API reference: https://developers.zalo.me/docs/api/official-account-api/api/send-message-api-v3
  const body = {
    recipient: { user_id: zaloId },
    message: { text: message.Content }
  };
  
  log.debug('Send Zalo Message body', body);

  const options = {
    host: 'openapi.zalo.me',
    path: `${PATH}?access_token=${accessToken}`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  };

  const result = await new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let responseBody = '';
      res.on('data', (chunk) => {
        responseBody += chunk;
      });

      res.on('end', () => {
        resolve(responseBody);
      });
    });

    req.on('error', (err) => {
      log.error('Error sending Zalo message', err);
      reject(err);
    });

    req.write(JSON.stringify(body));
    req.end();
  });

  const resultObj = JSON.parse(result);
  log.debug('Send Zalo Message result', result);

  if (resultObj.error !== undefined) {
    log.error('Error sending Zalo message', resultObj);
    return false;
  }

  return true;
};

const getZaloSecrets = async () => {
  if (process.env.ZALO_SECRET) {
    const params = {
      SecretId: process.env.ZALO_SECRET
    }
    const response = await secretManager.getSecretValue(params).promise();
    accessToken = JSON.parse(response.SecretString).ACCESS_TOKEN
    appSecret = JSON.parse(response.SecretString).APP_SECRET
  } else {
    accessToken = null;
    appSecret = null;
  }
};

module.exports = { handler };