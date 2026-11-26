# @hattoriai/poney-core

The Poney format: a JSON document that describes software (its parts, how they connect, its data, its behaviour) and the walkthroughs that explain it. Schema, validation and lints, model queries, commands with undo, extensions, and JSON and Mermaid adapters. Depends only on Zod.

```ts
import { checkDocument, parseDocument } from '@hattoriai/poney-core'

const result = checkDocument(JSON.parse(text))
if (!result.ok) console.log(result.errors)
```

Part of [Poney](https://github.com/hattoriai/poney): the format, the renderers, and tools to explain software. MIT licensed.
