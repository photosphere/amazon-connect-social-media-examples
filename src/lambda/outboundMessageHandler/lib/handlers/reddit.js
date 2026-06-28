// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

const https = require('https');
const querystring = require('querystring');
const AWS = require('aws-sdk');
const { log } = require('common-util');

// Reddit API hosts
const OAUTH_HOST = 'oauth.reddit.com';
const TOKEN_HOST = 'www.reddit.com';
const COMPOSE_PATH = '/api/compose';
const TOKEN_PATH = '/api/v1/access_token';
const DEFAULT_SUBJECT = 'Amazon Connect';

let clientId = undefined;
let clientSecret = undefined;
let refreshToken = undefined;
let username = undefined;
let password = undefined;
let userAgent = undefined;
let subject = undefined;

// Cache the OAuth access token along with its expiry (Reddit tokens last ~1h)
let cachedAccessToken = undefined;
let cachedTokenExpiry = 0;

const secretManager = new AWS.SecretsManager();

const handler = async (redditUsername, message) => {
  if (message.Type === 'EVENT') {
    log.debug('Ignoring event message', message);
    return;
  }

  if (clientId === undefined) {
    await getRedditSecrets();
  }

  if (clientId === null || clientSecret === null) {
    log.error('Reddit client credentials not found in Secrets Manager');
    return false;
  }

  const accessToken = await getAccessToken();
  if (!accessToken) {
    log.error('Unable to obtain Reddit access token');
    return false;
  }

  return await sendMessage(redditUsername, message, accessToken);
};

const sendMessage = async (redditUsername, message, accessToken) => {
  // Send a private message via the Reddit API.
  // Reference: https://www.reddit.com/dev/api/#POST_api_compose
  const postData = querystring.stringify({
    api_type: 'json',
    to: redditUsername,
    subject: subject || DEFAULT_SUBJECT,
    text: message.Content,
  });

  const options = {
    host: OAUTH_HOST,
    path: COMPOSE_PATH,
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(postData),
      'User-Agent': userAgent || 'amazon-connect-social-media',
    },
  };

  const result = await httpsRequest(options, postData, 'Reddit message');

  if (result === null) {
    return false;
  }

  const resultObj = JSON.parse(result);
  log.debug('Send Reddit Message result', resultObj);

  // Reddit returns errors inside json.errors as an array of tuples
  if (
    resultObj.json &&
    Array.isArray(resultObj.json.errors) &&
    resultObj.json.errors.length > 0
  ) {
    log.error('Error sending Reddit message', resultObj.json.errors);
    return false;
  }

  return true;
};

// Obtain an OAuth access token, refreshing it if expired.
const getAccessToken = async () => {
  const now = Date.now();
  if (cachedAccessToken && now < cachedTokenExpiry) {
    return cachedAccessToken;
  }

  // Prefer refresh_token grant; fall back to password grant
  let grant;
  if (refreshToken) {
    grant = {
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    };
  } else if (username && password) {
    grant = {
      grant_type: 'password',
      username,
      password,
    };
  } else {
    log.error(
      'No Reddit refresh token or username/password available to obtain access token'
    );
    return null;
  }

  const postData = querystring.stringify(grant);
  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString(
    'base64'
  );

  const options = {
    host: TOKEN_HOST,
    path: TOKEN_PATH,
    method: 'POST',
    headers: {
      Authorization: `Basic ${basicAuth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(postData),
      'User-Agent': userAgent || 'amazon-connect-social-media',
    },
  };

  const result = await httpsRequest(options, postData, 'Reddit access token');

  if (result === null) {
    return null;
  }

  const resultObj = JSON.parse(result);

  if (resultObj.error !== undefined || resultObj.access_token === undefined) {
    log.error('Error obtaining Reddit access token', resultObj);
    return null;
  }

  cachedAccessToken = resultObj.access_token;
  // Refresh 60s before the token actually expires
  const expiresInMs = (resultObj.expires_in || 3600) * 1000;
  cachedTokenExpiry = Date.now() + expiresInMs - 60000;

  return cachedAccessToken;
};

// Shared HTTPS request helper returning the response body string, or null on error.
const httpsRequest = (options, postData, label) => {
  return new Promise((resolve) => {
    const req = https.request(options, (res) => {
      let responseBody = '';
      res.on('data', (chunk) => {
        responseBody += chunk;
      });

      res.on('end', () => {
        log.debug(`${label} response`, responseBody);
        resolve(responseBody);
      });
    });

    req.on('error', (err) => {
      log.error(`Error during ${label} request`, err);
      resolve(null);
    });

    req.write(postData);
    req.end();
  });
};

const getRedditSecrets = async () => {
  if (process.env.REDDIT_SECRET) {
    const params = {
      SecretId: process.env.REDDIT_SECRET,
    };
    const response = await secretManager.getSecretValue(params).promise();
    const secret = JSON.parse(response.SecretString);
    clientId = secret.REDDIT_CLIENT_ID;
    clientSecret = secret.REDDIT_CLIENT_SECRET;
    refreshToken = secret.REDDIT_REFRESH_TOKEN;
    username = secret.REDDIT_USERNAME;
    password = secret.REDDIT_PASSWORD;
    userAgent = secret.REDDIT_USER_AGENT;
    subject = secret.REDDIT_MESSAGE_SUBJECT;
  } else {
    clientId = null;
    clientSecret = null;
  }
};

module.exports = { handler };
