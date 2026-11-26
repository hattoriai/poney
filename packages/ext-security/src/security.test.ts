import { describe, expect, it } from 'vitest'
import { checkDocument, validateDocument } from '@poney/core'
import { crossings, inZone, security, zoneOf } from './index'

const doc = (patch: (d: any) => void = () => {}) => {
  const d: any = {
    poneyVersion: '0.1.0',
    project: { id: 'shop', name: 'Shop', description: 'A shop.' },
    extensions: [{ name: 'security', version: '0.1.0' }],
    model: {
      entities: [
        { id: 'internet', kind: 'security/zone', name: 'Internet', summary: 'Anyone.', ext: { security: { trust: 'public' } } },
        { id: 'platform', kind: 'security/zone', name: 'Platform', summary: 'Our services.', ext: { security: { trust: 'internal' } } },
        { id: 'vault', kind: 'security/zone', name: 'Vault', summary: 'Card data.', ext: { security: { trust: 'restricted' } } },
        { id: 'web', kind: 'web-app', name: 'Web', summary: 'The storefront.', ext: { security: { zone: 'internet' } } },
        { id: 'shop', kind: 'system', name: 'Shop', summary: 'The backend.', ext: { security: { zone: 'platform' } } },
        { id: 'orders', kind: 'service', name: 'Orders', summary: 'Takes orders.', parent: 'shop' },
        { id: 'cards', kind: 'service', name: 'Cards', summary: 'Keeps cards.', ext: { security: { zone: 'vault' } } },
        { id: 'db', kind: 'database', name: 'DB', summary: 'Rows.', parent: 'shop' },
      ],
      relationships: [
        { id: 'web-orders', kind: 'calls', source: 'web', target: 'orders', label: 'Places orders', data: ['customer'] },
        { id: 'orders-cards', kind: 'calls', source: 'orders', target: 'cards', label: 'Charges cards', data: ['card'], ext: { security: { encrypted: true, auth: 'mTLS' } } },
        { id: 'orders-db', kind: 'writes', source: 'orders', target: 'db', label: 'Saves orders', data: ['customer'] },
      ],
      dataTypes: [
        { id: 'customer', kind: 'record', name: 'Customer', summary: 'Who buys.', ext: { security: { classes: ['personal'] } } },
        { id: 'card', kind: 'record', name: 'Card', summary: 'A card.', ext: { security: { classes: ['payment'] } } },
      ],
    },
  }
  patch(d)
  return d
}

const codes = (d: unknown) => checkDocument(d, { extensions: [security] }).warnings.filter((w) => w.code?.startsWith('security-'))

describe('the security extension', () => {
  it('finds zones through parents, and the lines that cross them', () => {
    const r = validateDocument(doc(), { extensions: [security] })
    expect(r.ok).toBe(true)
    const d = r.document!
    expect(zoneOf(d, d.model.entities.find((e) => e.id === 'orders'))?.id).toBe('platform')
    expect(crossings(d).map((c) => [c.relationship.id, c.classes])).toEqual([
      ['web-orders', ['personal']],
      ['orders-cards', ['payment']],
    ])
    expect(inZone(d, 'platform').map((e) => e.id)).toEqual(['shop', 'orders', 'db'])
  })

  it('warns when sensitive data crosses a zone without encryption or a named auth', () => {
    const w = codes(doc())
    expect(w.map((x) => [x.code, x.path])).toEqual([
      ['security-unencrypted-crossing', 'model.relationships.0'],
      ['security-unknown-auth', 'model.relationships.0'],
    ])
    expect(w[0].message).toBe('"Places orders" carries personal data from Web to Orders without encryption.')
  })

  it('counts data from data flows that go through a relationship', () => {
    const w = codes(
      doc((d) => {
        d.model.relationships[1].data = []
        d.model.relationships[1].ext = {}
        d.model.dataFlows = [{ id: 'f', source: 'orders', target: 'cards', data: ['card'], label: 'Card', via: 'orders-cards' }]
      }),
    )
    expect(w.filter((x) => x.path === 'model.relationships.1').map((x) => x.code)).toEqual(['security-unencrypted-crossing', 'security-unknown-auth'])
  })

  it('warns about an open way into a restricted zone, and sensitive data stored in a public zone', () => {
    const w = codes(
      doc((d) => {
        d.model.relationships[1].ext.security.auth = 'none'
        d.model.entities[7].ext = { security: { zone: 'internet' } }
        d.model.dataTypes[0].storedIn = 'db'
      }),
    )
    expect(w.map((x) => x.code)).toEqual(expect.arrayContaining(['security-open-restricted', 'security-sensitive-in-public']))
  })

  it('rejects a zone that is not a zone, and stays quiet for documents that do not declare it', () => {
    const bad = validateDocument(doc((d) => (d.model.entities[3].ext.security.zone = 'shop')), { extensions: [security] })
    expect(bad.issues.find((i) => i.severity === 'error')?.message).toBe('"shop" is not a zone (kind "security/zone")')
    expect(codes(doc((d) => ((d.extensions = []), d.model.entities.forEach((e: any) => (e.ext = {})), d.model.relationships.forEach((r: any) => (r.ext = {})), d.model.dataTypes.forEach((x: any) => (x.ext = {})), (d.model.entities = d.model.entities.filter((e: any) => e.kind !== 'security/zone')))))).toEqual([])
  })
})
