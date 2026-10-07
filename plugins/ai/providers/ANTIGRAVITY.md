# Antigravity subscription transport

Reverse-engineered 2026-08-19 from `/Applications/Antigravity.app/Contents/Resources/bin/language_server`
(a 127 MB Go binary — the same architecture Windsurf/Codeium use, where the
Electron shell is a thin client over a native language server) and confirmed
against the live API with the account's own OAuth token.

## The finding that matters

`gemini-sub` dispatches to `cloudcode-pa.googleapis.com/v1internal:streamGenerateContent`.
That is the **Gemini CLI / Code Assist** method, and it bills the **free Code
Assist tier**, which returns:

```
429 { "error": { "code": 429, "message": "Resource has been exhausted (e.g. check quota)." } }
```

Antigravity is a *different product on the same host*. Its chat runs through
`:streamGenerateChat`, which bills the **Antigravity subscription pool** — a
separate quota that was completely untouched while the free tier was exhausted:

```
POST /v1internal:retrieveUserQuota  ->  200
  buckets: [ { modelId: "chat_20706", remainingFraction: 1 }, ... ]   # all 1 == full
```

So a Gemini-family provider can be unusable and fully available at the same
time, depending only on which method is called. The route currently picks the
exhausted one.

## The v1internal surface

Extracted from the binary (`strings | grep -oE "/v1internal:[a-zA-Z]+"`):

```
battleModeOverrides      fetchCodeCustomizationState  listRemoteRepositories   recordTrajectoryAnalytics
checkUrlDenylist         fetchFromTrawlerCache        loadCodeAssist           registerInteraction
completeCode             fetchUserInfo                migrateDatabaseCode      retrieveUserQuota
countTokens              generateChat                 onboardUser              rewriteUri
fetchAdminControls       generateCode                 onboardUserBackgroundTasks  searchSnippets
fetchAvailableModels     generateContent              recordClientEvent        setCodeAssistGlobalUserSetting
                         getCodeAssistGlobalUserSetting  recordCodeAssistMetrics  setUserSettings
                         internalAtomicAgenticChat    recordSmartchoicesFeedback  streamGenerateChat
                         listAgents                                            streamGenerateContent
                         listCloudAICompanionProjects                          tabChat
                         listExperiments                                       transformCode
                         listModelConfigs
```

The gRPC service is `google.internal.cloud.code.v1internal.JetskiService`.

## `:streamGenerateChat` request shape

Established by probing: the endpoint rejects unknown fields by name, so the
schema can be enumerated one field at a time.

```jsonc
{
  "project": "iron-courage-jc5ww",   // bare id, NOT "projects/<id>" — the prefixed
                                     // form yields an IAM error on "projects/projects/<id>".
                                     // Obtain from :loadCodeAssist -> cloudaicompanionProject
  "userMessage": "…",                // scalar string, not an object
  "history": [ { "content": "…" } ], // accepted; element field is `content`
  "modelConfigId": "…",              // TYPE_STRING, see UNRESOLVED below
  "metadata": { }                    // accepted; shape not yet mapped
}
```

Headers (the identity the dialect already sends for code-assist):

```
authorization: Bearer <GEMINI_SUB_OAUTH_TOKEN>
x-goog-api-client: gl-node
user-agent: Antigravity/2.0.1 (Jetbrains; DARWIN_ARM64)
content-type: application/json
```

Rejected field names, for the record: `model`, `request`, `contents`,
`messages`, `chat`, `input`, `chatInput`, `conversation`, `prompt`,
`clientContext`.

## Response

A JSON **array** of chunk objects — neither `sse` nor `ndjson`, so it does not
fit the existing `WireRequest.framing` union and needs a third framing (or a
dialect-local parse of the whole body).

```jsonc
[ { "markdown": "…",                     // the assistant text
    "processingDetails": { "cm": "CHAT", "modelConfig": { "id": "chat-gemini-3-1-pro-preview-paid-tier",
                                                          "displayName": "3.1 Pro Preview" } },
    "fileUsage": {},
    "usageMetadata": { "candidatesTokenCount": "1", "totalTokenCount": "816" } } ]
```

Note `…-paid-tier`: this is the subscription pool, which is the whole point.

## `:fetchAvailableModels`

Returns 24 models keyed by id, each with `displayName`, `maxTokens`,
`maxOutputTokens`, `quotaInfo.remainingFraction`, `apiProvider`,
`modelProvider`. Top-level also carries `defaultAgentModelId`,
`commandModelIds`, `tabModelIds`, `webSearchModelIds`, `tieredModelIds`.

This is a live catalog with per-model quota, and it spans providers — the
subscription proxies Anthropic and OpenAI models too:

```
gemini-3.1-pro-low / -high        1048576 ctx   65535 out
gemini-3.6-flash-low / -medium / -high
gemini-3.5-flash-extra-low / -low
gemini-3-flash, gemini-3-flash-agent, gemini-pro-agent
gemini-2.5-pro, gemini-2.5-flash, -lite, -thinking
claude-sonnet-4-6                  250000 ctx   64000 out
claude-opus-4-6-thinking           250000 ctx   64000 out
gpt-oss-120b-medium                131072 ctx   32768 out
```

The `-low` / `-medium` / `-high` suffixes are this provider's **reasoning
effort levels expressed as separate model ids**, which is how effort should be
surfaced for this route rather than as a separate control.

## RESOLVED — chat model selection is server-determined

`modelConfigId` is accepted as a field and refused for every value, which
looked like a discovery problem. The evidence says otherwise: it is a
whitelist the client does not populate from any published list.

- `metadata` carries only client identity (`ideType`, `platform`, `pluginType`,
  `ideVersion`, `pluginVersion`, `duetProject`) — no model field.
- `:internalAtomicAgenticChat`, the agent method, accepts exactly `project`,
  `userMessage`, `history`, `metadata` — also no model field.
- `fetchAvailableModels` groups its ids by *surface*: `commandModelIds`,
  `tabModelIds`, `webSearchModelIds`, `imageGenerationModelIds`,
  `commitMessageModelIds`, plus `defaultAgentModelId` and `agentModelSorts`.
  There is no `chatModelIds`. The 24-model catalog with the `-low`/`-medium`/
  `-high` effort variants is the **agent** catalog.
- The server picks and echoes back `chat-gemini-3-1-pro-preview-paid-tier`,
  whose `-paid-tier` suffix is an entitlement, not a user choice — and that
  exact string is itself refused as input.
- `language_server` exports `GetModelConfigId` / `ChatModelConfig`, i.e. the
  client *derives* the id rather than reading it from a response, which is why
  no endpoint publishes one.

So the chat surface this dialect speaks does not take a caller-chosen model:
the model follows the account's tier. A single-model route is the correct
shape for `:streamGenerateChat`, not a limitation to work around.

Per-model choice — and therefore the effort variants — belongs to the agent
surface, which would need its request shape mapped (the method accepts no model
field as called here, so the selection likely rides a trajectory/agent object
this probing has not reached). That is a separate transport, not a missing
argument on this one.

## Historical — the values ruled out for `modelConfigId`

The field is `TYPE_STRING` and is accepted, but every id the API itself
publishes is refused with `INVALID_ARGUMENT`:

- `fetchAvailableModels` keys — `gemini-3.1-pro-high`, `gemini-3-flash` …
- `retrieveUserQuota` bucket ids — `chat_20706`, `chat_23310`
- the served id echoed back in the response — `chat-gemini-3-1-pro-preview-paid-tier`
- the enum values — `MODEL_PLACEHOLDER_M18`, `MODEL_GOOGLE_GEMINI_2_5_PRO`
- numeric forms — `20706` (and as a number, which fails the type check)

Omitting it works and the backend picks `chat-gemini-3-1-pro-preview-paid-tier`
("3.1 Pro Preview"). So a route can ship today with the default model; explicit
selection needs the id space, most likely from `:listModelConfigs` (which
requires arguments — it returns `INVALID_ARGUMENT` on `{}`) or from the proto
descriptor in the binary.

## Implementation sketch

1. A vault ref for the project (`:loadCodeAssist` -> `cloudaicompanionProject`),
   since the dialect is a pure serializer and cannot fetch it. This needs a
   `header`-kind credential slot, or the project carried through
   `DialectAuth.headers`.
2. An `antigravity` dialect: serialize to the shape above, parse the JSON array
   into text chunks plus `usageMetadata`.
3. A route `antigravity-sub`, displayed as **Antigravity (Subscription)** so it
   is not confused with the Gemini/Google Cloud API — the same models are
   reachable through both, on different quotas.
4. Catalog discovery from `:fetchAvailableModels`, whose `quotaInfo` also gives
   this route a genuine status light.
