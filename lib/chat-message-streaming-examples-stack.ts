// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
import * as cdk from "aws-cdk-lib";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as sns from "aws-cdk-lib/aws-sns";
import * as subscriptions from "aws-cdk-lib/aws-sns-subscriptions";
import * as iam from "aws-cdk-lib/aws-iam";
import * as path from "path";
import * as apigw2 from "aws-cdk-lib/aws-apigatewayv2";
import * as apigw2i from "aws-cdk-lib/aws-apigatewayv2-integrations";
import { Duration } from "aws-cdk-lib";
import { Construct } from "constructs";

export class ChatMessageStreamingExamplesStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // The code that defines your stack goes here

    // Need deployment mechanism to check if they are deploying SMS or FB or Both demos and validate on that

    // Get environment variables from context

    const amazonConnectArn = this.node.tryGetContext("amazonConnectArn");
    const contactFlowId = this.node.tryGetContext("contactFlowId");
    const pinpointAppId = this.node.tryGetContext("pinpointAppId");
    const smsNumber = this.node.tryGetContext("smsNumber");
    const fbSecretArn = this.node.tryGetContext("fbSecretArn");
    const inSecretArn = this.node.tryGetContext("inSecretArn");
    const waSecretArn = this.node.tryGetContext("waSecretArn");
    const zaloSecretArn = this.node.tryGetContext("zaloSecretArn");
    const wechatSecretArn = this.node.tryGetContext("wechatSecretArn");
    const piiRedactionTypes = this.node.tryGetContext("piiRedactionTypes");
    let enableFB = false;
    let enableWhatsApp = false;
    let enableInstagram = false;
    let enableZalo = false;
    let enableWeChat = false;
    let enableSMS = false;
    let enablePII = false;

    // Validating that environment variables are present
    if (amazonConnectArn === undefined) {
      throw new Error("Missing amazonConnectArn in the context");
    }

    if (contactFlowId === undefined) {
      throw new Error("Missing Amazon Connect Contact flow Id in the context");
    }

    if (pinpointAppId === undefined && smsNumber === undefined) {
      enableSMS = false;
    } else if (pinpointAppId !== undefined && smsNumber === undefined) {
      throw new Error("Missing smsNumber in the context");
    } else if (pinpointAppId === undefined && smsNumber !== undefined) {
      throw new Error("Missing pinpointAppId in the context");
    } else {
      enableSMS = true;
    }

    if (fbSecretArn != undefined) {
      enableFB = true;
    }

    if (waSecretArn != undefined) {
      enableWhatsApp = true;
    }

    if (inSecretArn != undefined) {
      enableInstagram = true;
    }

    if (zaloSecretArn != undefined) {
      enableZalo = true;
    }

    if (wechatSecretArn != undefined) {
      enableWeChat = true;
    }

    if (piiRedactionTypes != undefined) {
      if (piiRedactionTypes) {
        enablePII = true;
      } else {
        throw new Error(
          "piiRedactionTypes cannot be empty, expecting comma separated values of AWS Comprehend PII types"
        );
      }
    }

    if (
      enableInstagram == false &&
      enableWhatsApp === false &&
      enableFB === false &&
      enableZalo === false &&
      enableWeChat === false &&
      enableSMS === false
    ) {
      throw new Error(
        "Please enable at least one channel, SMS, Facebook, Instagram, WhatsApp, Zalo, or WeChat. You can do so by providing fbSecretArn in the context to enable Facebook, waSecretArn in the context to enable WhatsApp, zaloSecretArn in the context to enable Zalo, wechatSecretArn in the context to enable WeChat, or by providing pinpointAppId and smsNumber to enable SMS channel"
      );
    }

    const debugLog = new cdk.CfnParameter(this, "debugLog", {
      allowedValues: ["true", "false"],
      default: "false",
      type: "String",
      description:
        "Setting to enable debug level logging in lambda functions.  Recommended to turn this off in production.",
    });

    // pinpoint project will not be in cdk - phone number has to be manually claimed

    // DDB - need GSI

    // Dynamo DB table

    const chatContactDdbTable = new dynamodb.Table(this, "chatTable", {
      partitionKey: {
        name: "contactId",
        type: dynamodb.AttributeType.STRING,
      },
      timeToLiveAttribute: "date",
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Dynamo DB table GSI
    // vendorId is phone number or facebook user id

    const vendorIdChannelIndexName = "vendorId-index";
    chatContactDdbTable.addGlobalSecondaryIndex({
      indexName: vendorIdChannelIndexName,
      partitionKey: {
        name: "vendorId",
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: "channel",
        type: dynamodb.AttributeType.STRING,
      },
    });

    let smsOutboundMsgStreamingTopic;
    let smsOutboundMsgStreamingTopicStatement;

    if (enableSMS) {
      // outbound SNS topic
      smsOutboundMsgStreamingTopic = new sns.Topic(
        this,
        "smsOutboundMsgStreamingTopic",
        {}
      );

      smsOutboundMsgStreamingTopicStatement = new iam.PolicyStatement({
        actions: ["sns:Subscribe", "sns:Publish"],
        principals: [new iam.ServicePrincipal("connect.amazonaws.com")],
        resources: [smsOutboundMsgStreamingTopic.topicArn],
      });

      smsOutboundMsgStreamingTopic.addToResourcePolicy(
        smsOutboundMsgStreamingTopicStatement
      );
    }

    let digitalOutboundMsgStreamingTopic;
    let digitalOutboundMsgStreamingTopicStatement;

    if (enableFB || enableWhatsApp || enableInstagram || enableZalo || enableWeChat) {
      digitalOutboundMsgStreamingTopic = new sns.Topic(
        this,
        "digitalOutboundMsgStreamingTopic",
        {}
      );

      digitalOutboundMsgStreamingTopicStatement = new iam.PolicyStatement({
        actions: ["sns:Subscribe", "sns:Publish"],
        principals: [new iam.ServicePrincipal("connect.amazonaws.com")],
        resources: [digitalOutboundMsgStreamingTopic.topicArn],
      });

      digitalOutboundMsgStreamingTopic.addToResourcePolicy(
        digitalOutboundMsgStreamingTopicStatement
      );
    }

    // Inbound Lambda function
    const inboundMessageFunction = new lambda.Function(
      this,
      "inboundMessageFunction",
      {
        runtime: lambda.Runtime.NODEJS_18_X,
        handler: "index.handler",
        code: lambda.Code.fromAsset(
          path.resolve(__dirname, "../src/lambda/inboundMessageHandler")
        ),
        timeout: Duration.seconds(120),
        memorySize: 512,
        environment: {
          FB_SECRET: fbSecretArn,
          WA_SECRET: waSecretArn,
          IN_SECRET: inSecretArn,
          ZALO_SECRET: zaloSecretArn,
          WECHAT_SECRET: wechatSecretArn,
          CONTACT_TABLE: chatContactDdbTable.tableName,
          AMAZON_CONNECT_ARN: amazonConnectArn,
          CONTACT_FLOW_ID: contactFlowId,
          DIGITAL_OUTBOUND_SNS_TOPIC:
            digitalOutboundMsgStreamingTopic !== undefined
              ? digitalOutboundMsgStreamingTopic.topicArn
              : "",
          SMS_OUTBOUND_SNS_TOPIC:
            smsOutboundMsgStreamingTopic !== undefined
              ? smsOutboundMsgStreamingTopic.topicArn
              : "",
          VENDOR_ID_CHANNEL_INDEX_NAME: vendorIdChannelIndexName,
          DEBUG_LOG: debugLog.valueAsString,
          PII_DETECTION_TYPES:
            piiRedactionTypes !== undefined ? piiRedactionTypes : "",
        },
      }
    );

    // Inbound SNS topic (for SMS)
    let inboundSMSTopic: sns.Topic;

    if (enableSMS) {
      inboundSMSTopic = new sns.Topic(this, "InboundSMSTopic", {});
      inboundSMSTopic.addSubscription(
        new subscriptions.LambdaSubscription(inboundMessageFunction)
      );
      new cdk.CfnOutput(this, "SmsInboundTopic", {
        value: inboundSMSTopic.topicArn.toString(),
      });
    }

    if (enablePII) {
      inboundMessageFunction.addToRolePolicy(
        new iam.PolicyStatement({
          actions: ["comprehend:DetectPiiEntities"],
          resources: ["*"],
          effect: iam.Effect.ALLOW,
        })
      );
    }

    if (enableFB) {
      inboundMessageFunction.addToRolePolicy(
        new iam.PolicyStatement({
          actions: ["secretsmanager:GetSecretValue"],
          resources: [fbSecretArn],
          effect: iam.Effect.ALLOW,
        })
      );
    }
    if (enableWhatsApp) {
      inboundMessageFunction.addToRolePolicy(
        new iam.PolicyStatement({
          actions: ["secretsmanager:GetSecretValue"],
          resources: [waSecretArn],
          effect: iam.Effect.ALLOW,
        })
      );
    }

    if(enableInstagram){
      inboundMessageFunction.addToRolePolicy(
        new iam.PolicyStatement({
          actions: ['secretsmanager:GetSecretValue'],
          resources: [inSecretArn],
          effect: iam.Effect.ALLOW,
        })
      );
    }

    if(enableZalo){
      inboundMessageFunction.addToRolePolicy(
        new iam.PolicyStatement({
          actions: ['secretsmanager:GetSecretValue'],
          resources: [zaloSecretArn],
          effect: iam.Effect.ALLOW,
        })
      );
    }

    if(enableWeChat){
      inboundMessageFunction.addToRolePolicy(
        new iam.PolicyStatement({
          actions: ['secretsmanager:GetSecretValue'],
          resources: [wechatSecretArn],
          effect: iam.Effect.ALLOW,
        })
      );
    }

    inboundMessageFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["connect:StartChatContact"],
        resources: [
          `${this.node.tryGetContext(
            "amazonConnectArn"
          )}/contact-flow/${this.node.tryGetContext("contactFlowId")}`,
        ],
        effect: iam.Effect.ALLOW,
      })
    );

    inboundMessageFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["connect:StartContactStreaming"],
        resources: [`${this.node.tryGetContext("amazonConnectArn")}/contact/*`],
        effect: iam.Effect.ALLOW,
      })
    );

    inboundMessageFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: [
          "dynamodb:PutItem",
          "dynamodb:GetItem",
          "dynamodb:Scan",
          "dynamodb:Query",
          "dynamodb:UpdateItem",
        ],
        resources: [
          chatContactDdbTable.tableArn,
          `${chatContactDdbTable.tableArn}/index/${vendorIdChannelIndexName}`,
        ],
        effect: iam.Effect.ALLOW,
      })
    );

    // SNS topic filter rules (filter by attribute at the topic level)
    // outbound Lambda function
    const outboundMessageFunction = new lambda.Function(
      this,
      "outboundMessageFunction",
      {
        runtime: lambda.Runtime.NODEJS_18_X,
        handler: "index.handler",
        code: lambda.Code.fromAsset(
          path.resolve(__dirname, "../src/lambda/outboundMessageHandler")
        ),
        timeout: Duration.seconds(60),
        memorySize: 512,
        environment: {
          CONTACT_TABLE: chatContactDdbTable.tableName,
          PINPOINT_APPLICATION_ID: pinpointAppId,
          FB_SECRET: fbSecretArn,
          WA_SECRET: waSecretArn,
          IN_SECRET: inSecretArn,
          ZALO_SECRET: zaloSecretArn,
          WECHAT_SECRET: wechatSecretArn,
          SMS_NUMBER: smsNumber,
          DEBUG_LOG: debugLog.valueAsString,
        },
      }
    );

    outboundMessageFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["mobiletargeting:SendMessages"],
        effect: iam.Effect.ALLOW,
        resources: [
          `arn:aws:mobiletargeting:${this.region}:${
            this.account
          }:apps/${this.node.tryGetContext("pinpointAppId")}/messages`,
        ],
      })
    );

    if (enableFB) {
      outboundMessageFunction.addToRolePolicy(
        new iam.PolicyStatement({
          actions: ["secretsmanager:GetSecretValue"],
          resources: [fbSecretArn],
          effect: iam.Effect.ALLOW,
        })
      );
    }
    if (enableWhatsApp) {
      outboundMessageFunction.addToRolePolicy(
        new iam.PolicyStatement({
          actions: ["secretsmanager:GetSecretValue"],
          resources: [waSecretArn],
          effect: iam.Effect.ALLOW,
        })
      );
    }
    if(enableInstagram){
      outboundMessageFunction.addToRolePolicy(
        new iam.PolicyStatement({
          actions: ['secretsmanager:GetSecretValue'],
          resources: [inSecretArn],
          effect: iam.Effect.ALLOW,
        })
      );
    }

    if(enableZalo){
      outboundMessageFunction.addToRolePolicy(
        new iam.PolicyStatement({
          actions: ['secretsmanager:GetSecretValue'],
          resources: [zaloSecretArn],
          effect: iam.Effect.ALLOW,
        })
      );
    }

    if(enableWeChat){
      outboundMessageFunction.addToRolePolicy(
        new iam.PolicyStatement({
          actions: ['secretsmanager:GetSecretValue'],
          resources: [wechatSecretArn],
          effect: iam.Effect.ALLOW,
        })
      );
    }

    outboundMessageFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["dynamodb:GetItem", "dynamodb:DeleteItem"],
        resources: [
          chatContactDdbTable.tableArn,
          `${chatContactDdbTable.tableArn}/index/${vendorIdChannelIndexName}`,
        ],
        effect: iam.Effect.ALLOW,
      })
    );

    // health check Lambda
    let healthCheckFunction: lambda.Function;
    let digitalChannelMessageIntegration: apigw2i.HttpLambdaIntegration;
    let digitalChannelHealthCheckIntegration: apigw2i.HttpLambdaIntegration;
    let digitalChannelApi;

    if (enableFB || enableWhatsApp || enableInstagram || enableZalo || enableWeChat) {
      healthCheckFunction = new lambda.Function(this, "healthCheckFunction", {
        runtime: lambda.Runtime.NODEJS_18_X,
        handler: "index.handler",
        code: lambda.Code.fromAsset(
          path.resolve(__dirname, "../src/lambda/digitalChannelHealthCheck")
        ),
        environment: {
          DEBUG_LOG: debugLog.valueAsString,
          FB_SECRET: fbSecretArn,
          WA_SECRET: waSecretArn,
          IN_SECRET: inSecretArn,
          ZALO_SECRET: zaloSecretArn,
          WECHAT_SECRET: wechatSecretArn,
        },
      });
      if (enableFB) {
        healthCheckFunction.addToRolePolicy(
          new iam.PolicyStatement({
            actions: ["secretsmanager:GetSecretValue"],
            resources: [fbSecretArn],
            effect: iam.Effect.ALLOW,
          })
        );
      }
      if (enableWhatsApp) {
        healthCheckFunction.addToRolePolicy(
          new iam.PolicyStatement({
            actions: ["secretsmanager:GetSecretValue"],
            resources: [waSecretArn],
            effect: iam.Effect.ALLOW,
          })
        );
      }
      if(enableInstagram){
        healthCheckFunction.addToRolePolicy(
          new iam.PolicyStatement({
            actions: ['secretsmanager:GetSecretValue'],
            resources: [inSecretArn],
            effect: iam.Effect.ALLOW,
          })
        );
      }

      if(enableZalo){
        healthCheckFunction.addToRolePolicy(
          new iam.PolicyStatement({
            actions: ['secretsmanager:GetSecretValue'],
            resources: [zaloSecretArn],
            effect: iam.Effect.ALLOW,
          })
        );
      }

      if(enableWeChat){
        healthCheckFunction.addToRolePolicy(
          new iam.PolicyStatement({
            actions: ['secretsmanager:GetSecretValue'],
            resources: [wechatSecretArn],
            effect: iam.Effect.ALLOW,
          })
        );
      }
      // inbound API Gateway (digital channel)
      digitalChannelMessageIntegration = new apigw2i.HttpLambdaIntegration(
        "inboundMessageFunction",
        inboundMessageFunction
      );

      // digitalChannelHealthCheckIntegration = new apigw2i.HttpLambdaIntegration({
      digitalChannelHealthCheckIntegration = new apigw2i.HttpLambdaIntegration(
        "healthCheckFunction",
        healthCheckFunction
      );

      digitalChannelApi = new apigw2.HttpApi(this, "digitalChannelApi", {
        corsPreflight: {
          allowOrigins: ["*"],
          allowMethods: [
            apigw2.CorsHttpMethod.OPTIONS,
            apigw2.CorsHttpMethod.POST,
            apigw2.CorsHttpMethod.GET,
          ],
          allowHeaders: ["Content-Type"],
        },
      });
      if (enableFB) {
        digitalChannelApi.addRoutes({
          path: "/webhook/facebook",
          methods: [apigw2.HttpMethod.POST],
          integration: digitalChannelMessageIntegration,
        });
        digitalChannelApi.addRoutes({
          path: "/webhook/facebook",
          methods: [apigw2.HttpMethod.GET],
          integration: digitalChannelHealthCheckIntegration,
        });
        new cdk.CfnOutput(this, "FacebookApiGatewayWebhook", {
          value: digitalChannelApi.apiEndpoint.toString() + "/webhook/facebook",
        });
      }

      if (enableWhatsApp) {
        digitalChannelApi.addRoutes({
          path: "/webhook/whatsapp",
          methods: [apigw2.HttpMethod.POST],
          integration: digitalChannelMessageIntegration,
        });
        digitalChannelApi.addRoutes({
          path: "/webhook/whatsapp",
          methods: [apigw2.HttpMethod.GET],
          integration: digitalChannelHealthCheckIntegration,
        });
        new cdk.CfnOutput(this, "WhatsAppApiGatewayWebhook", {
          value: digitalChannelApi.apiEndpoint.toString() + "/webhook/whatsapp",
        });
      }

      if(enableInstagram){
        digitalChannelApi.addRoutes({
          path: '/webhook/instagram',
          methods: [apigw2.HttpMethod.POST],
          integration: digitalChannelMessageIntegration,
        });
        digitalChannelApi.addRoutes({
          path: '/webhook/instagram',
          methods: [apigw2.HttpMethod.GET],
          integration: digitalChannelHealthCheckIntegration,
        });
        new cdk.CfnOutput(this, 'InstagramApiGatewayWebhook', {
          value: digitalChannelApi.apiEndpoint.toString() + '/webhook/instagram',
        });
      }

      if(enableZalo){
        digitalChannelApi.addRoutes({
          path: '/webhook/zalo',
          methods: [apigw2.HttpMethod.POST],
          integration: digitalChannelMessageIntegration,
        });
        digitalChannelApi.addRoutes({
          path: '/webhook/zalo',
          methods: [apigw2.HttpMethod.GET],
          integration: digitalChannelHealthCheckIntegration,
        });
        new cdk.CfnOutput(this, 'ZaloApiGatewayWebhook', {
          value: digitalChannelApi.apiEndpoint.toString() + '/webhook/zalo',
        });
      }

      if(enableWeChat){
        digitalChannelApi.addRoutes({
          path: '/webhook/wechat',
          methods: [apigw2.HttpMethod.POST],
          integration: digitalChannelMessageIntegration,
        });
        digitalChannelApi.addRoutes({
          path: '/webhook/wechat',
          methods: [apigw2.HttpMethod.GET],
          integration: digitalChannelHealthCheckIntegration,
        });
        new cdk.CfnOutput(this, 'WeChatApiGatewayWebhook', {
          value: digitalChannelApi.apiEndpoint.toString() + '/webhook/wechat',
        });
      }

      // Outbound lambda subscribe to streaming topic
      if (digitalOutboundMsgStreamingTopic) {
        digitalOutboundMsgStreamingTopic.addSubscription(
          new subscriptions.LambdaSubscription(outboundMessageFunction, {
            filterPolicy: {
              MessageVisibility: sns.SubscriptionFilter.stringFilter({
                allowlist: ["CUSTOMER", "ALL"],
              }),
            },
          })
        );
      }
    }

    if (smsOutboundMsgStreamingTopic) {
      smsOutboundMsgStreamingTopic.addSubscription(
        new subscriptions.LambdaSubscription(outboundMessageFunction, {
          filterPolicy: {
            MessageVisibility: sns.SubscriptionFilter.stringFilter({
              allowlist: ["CUSTOMER", "ALL"],
            }),
          },
        })
      );
    }
  }
}

// pinpoint project in cdk - phone number has to be manually claimed
// inbound SNS topic (for SMS)
// inbound API Gateway (digital channel)
// inbound Lambda
// DDB -
// outbound SNS topic
// outbound lambda
