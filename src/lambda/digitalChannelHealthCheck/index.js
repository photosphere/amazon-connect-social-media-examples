// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
const { log } = require("common-util");
const fb = require("./lib/facebook");
const wa = require("./lib/whatsapp");
const ins = require("./lib/instagram");
const zalo = require("./lib/zalo");
const wechat = require("./lib/wechat");

exports.handler = async (event) => {
  log.debug("Event", event);

  switch (event.rawPath) {
    case "/webhook/facebook":
      log.debug("Facebook channel detected.");
      return await fb.handler(event);
    case "/webhook/whatsapp":
      log.debug("WhatsApp channel detected.");
      return await wa.handler(event);
    case "/webhook/instagram":
      log.debug("Instagram channel detected.");
      return await ins.handler(event);
    case "/webhook/zalo":
      log.debug("Zalo channel detected.");
      return await zalo.handler(event);
    case "/webhook/wechat":
      log.debug("WeChat channel detected.");
      return await wechat.handler(event);
    default:
      log.warn(
        `Request path "${event.rawPath}" does not match any expected paths.`
      );
      return {
        statusCode: 400,
        body: JSON.stringify({}),
      };
  }
};
