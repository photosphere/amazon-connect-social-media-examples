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

### Deploy FB and Ins Channel

```bash
cdk deploy \
--context amazonConnectArn=<YOUR INSTANCE ARN> \
--context contactFlowId=<YOUR CONTACT FLOW ID>  \
--context fbSecretArn=<YOUR FB SECRET ARN> \
--context inSecretArn=<YOUR INS SECRET ARN> \
--context stackId=<YOUR STACK NANME>
```
