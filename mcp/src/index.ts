import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { KaraokeApi } from './karaokeApi.js';
import { registerKaraokeTools } from './tools.js';

const DEFAULT_URL = 'http://127.0.0.1:3333';
const SERVER_INFO = { name: 'karaoke', version: '0.1.0' };

export function createKaraokeServer(api: KaraokeApi): McpServer {
  const server = new McpServer(SERVER_INFO, {
    instructions:
      'Ferramentas do karaokê da família: buscar músicas no YouTube, ver se têm letra, importar e acompanhar a ' +
      'fila de processamento. Responda em português. Antes de importar, prefira versões com letra sincronizada.',
  });
  registerKaraokeTools(server, api);
  return server;
}

async function main(): Promise<void> {
  const url = process.env.CARAOKE_URL ?? DEFAULT_URL;
  const key = process.env.CARAOKE_KEY ?? '';
  if (!key) console.error('CARAOKE_KEY não informada: funciona só no próprio PC do karaokê.');
  const server = createKaraokeServer(new KaraokeApi(url, key));
  await server.connect(new StdioServerTransport());
}

const isEntryPoint = process.argv[1]?.replace(/\\/g, '/').endsWith('caraoke-mcp.mjs') ?? false;
if (isEntryPoint || process.env.CARAOKE_MCP_MAIN === '1') {
  main().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
