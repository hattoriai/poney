# @hattoriai/poney-ext-security

A Poney extension: trust zones (`security/zone`), sensitive data classes on data types (personal, secret, payment, health), and how each connection is protected (encryption, authentication). Its lints warn where sensitive data crosses a zone unprotected.

```ts
import { security } from '@hattoriai/poney-ext-security'
import { checkDocument } from '@hattoriai/poney-core'

checkDocument(doc, { extensions: [security] }).warnings
```

Part of [Poney](https://github.com/hattoriai/poney): the format, the renderers, and tools to explain software. MIT licensed.
