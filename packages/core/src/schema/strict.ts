import { z } from 'zod'

/**
 * An object of a Poney document. It is strict: a member the format does not
 * define is an error, not dropped (spec section 9.1). Data the format leaves
 * open, such as an extension's, lives in records (`ext`, `metadata`).
 */
export const object = <T extends z.ZodRawShape>(shape: T) => z.object(shape).strict()
