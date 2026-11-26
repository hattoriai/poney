/**
 * Generates the language-neutral artifacts in spec/ from the reference
 * implementation:
 *
 *   spec/poney.schema.json                     JSON Schema (draft-07) of the document shape
 *   spec/examples/kestrel-commerce.poney  the sample project, with defaults filled in
 *
 * Run with `npm run spec`. Commit the output; other languages read it.
 */
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { zodToJsonSchema } from 'zod-to-json-schema'
import { PoneyDocument, PONEY_VERSION, parseDocument, toJSON } from '@hattoriai/poney-core'
import { commerce } from '@hattoriai/poney-examples'
import { ownership } from '@hattoriai/poney-ext-ownership'

const out = (path: string) => fileURLToPath(new URL(`../spec/${path}`, import.meta.url))

const schema = zodToJsonSchema(PoneyDocument, {
  name: 'PoneyDocument',
  target: 'jsonSchema7',
  $refStrategy: 'root',
  definitionPath: 'definitions',
})
const document = {
  ...schema,
  $id: `urn:poney:schema:${PONEY_VERSION}`,
  title: `Poney document ${PONEY_VERSION}`,
  description:
    'Shape of a Poney document. Shape only: identifier references, extension rules and the other checks in SPEC.md section 9 are not expressible in JSON Schema and must be applied by the reader.',
}
writeFileSync(out('poney.schema.json'), `${JSON.stringify(document, null, 2)}\n`)
writeFileSync(out('examples/kestrel-commerce.poney'), toJSON(parseDocument(commerce, { extensions: [ownership] })))
console.log('Wrote spec/poney.schema.json and spec/examples/kestrel-commerce.poney')
