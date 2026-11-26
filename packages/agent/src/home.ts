import { homedir } from 'node:os'
import { join } from 'node:path'

/** The folder where Poney keeps what it remembers between runs. */
export const poneyHome = (): string => process.env.PONEY_HOME ?? join(homedir(), '.poney')
