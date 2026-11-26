# @hattoriai/poney-ext-ownership

A Poney extension: teams (`ownership/team`), who owns what (`ext.ownership.team`), how to reach them, and a team map view. Its drawing part (`/layout`, `/diagram`) works with `@hattoriai/poney-layout` and `@hattoriai/poney-react`.

```ts
import { ownership } from '@hattoriai/poney-ext-ownership'
import { checkDocument } from '@hattoriai/poney-core'

checkDocument(doc, { extensions: [ownership] })
```

Part of [Poney](https://github.com/hattoriai/poney): the format, the renderers, and tools to explain software. MIT licensed.
