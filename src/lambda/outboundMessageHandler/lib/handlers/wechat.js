// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

const https = require('https');
const AWS = require('aws-sdk');
const { log } = require('common-util');

const PATH = '/cgi-bin/message/custom/send';
let accessToken = undefined;
let appSecret = undefined;

const secretManager = new AWS.SecretsManager();

const handler = async (wechatId, message) => {
  if (message.Type === 'EVENT') {
    log.debug('Ignoring event message', message);
    return;
  }

  if (accessToken === undefined || appSecret === undefined) {
    await getWechatSecrets();
  }

  if (accessToken === null) {
    log.error('Access token not found');
    return false;
  }

  return await sendMessage(wechatId, message);
};

const sendMessage = async (wechatId, message) => {
  // WeChat API reference: https://developers.weixin.qq.com/doc/offiaccount/Message_Management/Service_Center_messages.html
  const body = {
    touser: wechatId,
    msgtype: 'text',
    text: {
      content: message.Content
    }
  };
  
  log.debug('Send WeChat Message body', body);

  const options = {
    host: 'api.weixin.qq.com',
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
      log.error('Error sending WeChat message', err);
      reject(err);
    });

    req.write(JSON.stringify(body));
    req.end();
  });

  const resultObj = JSON.parse(result);
  log.debug('Send WeChat Message result', result);

  if (resultObj.errcode !== 0) {
    log.error('Error sending WeChat message', resultObj);
    return false;
  }

  return true;
};

const getWechatSecrets = async () => {
  if (process.env.WECHAT_SECRET) {
    const params = {
      SecretId: process.env.WECHAT_SECRET
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