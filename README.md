# amazon-connect-social-media-examples

## Install AWS CDK

`npm -g install typescript`
`npm install -g aws-cdk`

`cdk bootstrap aws://ACCOUNT_ID/AWS_REGION`

## Deployment commands

- `npm install`

- `cd src/lambda/inboundMessageHandler`

- `npm install`

- `cd ../../..`

- `cd src/lambda/outboundMessageHandler`

- `npm install`

- `cd ../../..`

- `cd src/lambda/digitalChannelHealthCheck`

- `npm install`

- `cd ../../..`

## Or Deployment commands

- `npm install && cd src/lambda/inboundMessageHandler && npm install && cd ../../.. && cd src/lambda/outboundMessageHandler && npm install && cd ../../.. && cd src/lambda/digitalChannelHealthCheck && npm install && cd ../../..`

### Deploy FB Channel only

```bash
cdk deploy \
--context amazonConnectArn=<YOUR INSTANCE ARN> \
--context contactFlowId=<YOUR CONTACT FLOW ID>  \
--context fbSecretArn=<YOUR FB SECRET ARN> \
--context stackId=<YOUR STACK NANME>
```


### Deploy FB channel only with PII redaction
```bash
cdk deploy \
--context amazonConnectArn=<YOUR INSTANCE ARN> \
--context contactFlowId=<YOUR CONTACT FLOW ID>  \
--context fbSecretArn=<YOUR FB SECRET ARN> \
--context piiRedactionTypes="<CSV LIST OF AMAZON COMPREHEND PII ENTITY TYPES, EX: PIN, CREDIT_DEBIT_NUMBER>" \
--context stackId=<YOUR STACK NANME>
```

### Deploy Ins Channel only

```bash
cdk deploy \
--context amazonConnectArn=<YOUR INSTANCE ARN> \
--context contactFlowId=<YOUR CONTACT FLOW ID>  \
--context inSecretArn=<YOUR INS SECRET ARN> \
--context stackId=<YOUR STACK NANME>
```

### Deploy Zalo Channel only

```bash
cdk deploy \
--context amazonConnectArn=<YOUR INSTANCE ARN> \
--context contactFlowId=<YOUR CONTACT FLOW ID>  \
--context zaloSecretArn=<YOUR ZALO SECRET ARN> \
--context stackId=<YOUR STACK NANME>
```

### Deploy Reddit Channel only

```bash
cdk deploy \
--context amazonConnectArn=<YOUR INSTANCE ARN> \
--context contactFlowId=<YOUR CONTACT FLOW ID>  \
--context redditSecretArn=<YOUR REDDIT SECRET ARN> \
--context stackId=<YOUR STACK NANME>
```

The Reddit secret (in AWS Secrets Manager) is expected to contain the following
key/value pairs as a JSON object:

| Key | Description |
| --- | --- |
| `REDDIT_APP_SECRET` | Shared secret used to validate the HMAC SHA-256 `x-hub-signature-256` header on inbound webhook requests. |
| `REDDIT_VERIFY_TOKEN` | Token echoed back during the webhook health-check / verification (`hub.verify_token`). |
| `REDDIT_CLIENT_ID` | OAuth client id of your Reddit "script"/"web" app. |
| `REDDIT_CLIENT_SECRET` | OAuth client secret of your Reddit app. |
| `REDDIT_REFRESH_TOKEN` | (Preferred) OAuth refresh token used to obtain access tokens for sending replies. |
| `REDDIT_USERNAME` | (Optional) Reddit username, used with `REDDIT_PASSWORD` for the password grant when no refresh token is provided. |
| `REDDIT_PASSWORD` | (Optional) Reddit password for the password grant. |
| `REDDIT_USER_AGENT` | User-Agent string sent on Reddit API calls (Reddit requires a descriptive UA). |
| `REDDIT_MESSAGE_SUBJECT` | (Optional) Subject line used on outbound private messages. Defaults to "Amazon Connect". |

> Note: Reddit does not natively push webhooks. A poller/relay that reads the
> Reddit inbox (`GET /message/inbox`) and forwards each message listing to the
> `/webhook/reddit` endpoint (signing the body with `REDDIT_APP_SECRET`) is
> expected to drive the inbound flow.

### Deploy FB and Ins Channel

```bash
cdk deploy \
--context amazonConnectArn=<YOUR INSTANCE ARN> \
--context contactFlowId=<YOUR CONTACT FLOW ID>  \
--context fbSecretArn=<YOUR FB SECRET ARN> \
--context inSecretArn=<YOUR INS SECRET ARN> \
--context stackId=<YOUR STACK NANME>
```

### Deploy with Multiple Channels (FB, Ins, Zalo)

```bash
cdk deploy \
--context amazonConnectArn=<YOUR INSTANCE ARN> \
--context contactFlowId=<YOUR CONTACT FLOW ID>  \
--context fbSecretArn=<YOUR FB SECRET ARN> \
--context inSecretArn=<YOUR INS SECRET ARN> \
--context zaloSecretArn=<YOUR ZALO SECRET ARN> \
--context stackId=<YOUR STACK NANME>
```
