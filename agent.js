// agente de IA para TurboWarp
import fs from 'fs';
import path from 'path';
import {fileURLToPath} from 'url';
import puppeteer from 'puppeteer';
import {WebSocketServer} from 'ws';

/**
 * Script principal que demonstra como um agente em Node.js pode abrir o editor
 * do TurboWarp, montar blocos dinamicamente (sprites, cenários, lógica) e
 * salvar o projeto final. O código é intensamente comentado para servir como
 * guia de estudo.
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TURBOWARP_URL = 'https://turbowarp.org/editor?fps=60&resolutionx=480&resolutiony=360&hwaccel=on';
const PROJECT_PATH = path.join(__dirname, 'dist', 'space-runner.sb3');
const CLOUD_PORT = 3001;

// ---------------------------------------------
// 1) Pequeno servidor WebSocket estilo CloudLink
// ---------------------------------------------
function startCloudServer(port = CLOUD_PORT) {
  const store = new Map();
  const wss = new WebSocketServer({port});

  wss.on('connection', socket => {
    socket.on('message', data => {
      try {
        const payload = JSON.parse(data.toString());
        if (payload.m === 'set') {
          store.set(payload.var, payload.value);
          const broadcast = JSON.stringify({m: 'update', var: payload.var, value: payload.value});
          wss.clients.forEach(client => client.readyState === client.OPEN && client.send(broadcast));
        }
      } catch (err) {
        console.error('Mensagem CloudLink inválida:', err.message);
      }
    });

    for (const [key, value] of store.entries()) {
      const snapshot = JSON.stringify({m: 'update', var: key, value});
      socket.send(snapshot);
    }
  });

  console.log(`Servidor CloudLink local escutando em ws://localhost:${port}`);
  return wss;
}

// ---------------------------------------------
// 2) Montagem do projeto dentro do navegador
// ---------------------------------------------
async function buildProject(page) {
  await page.goto(TURBOWARP_URL, {waitUntil: 'networkidle0'});

  // Espera o vm do Scratch ser carregado.
  const vmHandle = await page.waitForFunction(() => window.vm, {timeout: 30000});
  await vmHandle.dispose();

  // Registra uma extensão simples de WebSocket no próprio TurboWarp para
  // acessar o servidor local.
  await page.evaluate((cloudPort) => {
    const latestMessages = [];

    class CloudBridge {
      constructor() {
        this.socket = null;
      }

      getInfo() {
        return {
          id: 'cloudbridge',
          name: 'CloudLink Bridge',
          color1: '#4b9fea',
          blocks: [
            {
              opcode: 'connect',
              blockType: Scratch.BlockType.COMMAND,
              text: 'conectar ao servidor [URL]',
              arguments: {
                URL: {
                  type: Scratch.ArgumentType.STRING,
                  defaultValue: `ws://localhost:${cloudPort}`
                }
              }
            },
            {
              opcode: 'sendScore',
              blockType: Scratch.BlockType.COMMAND,
              text: 'enviar pontuação [TXT]',
              arguments: {
                TXT: {type: Scratch.ArgumentType.STRING, defaultValue: '0'}
              }
            },
            {
              opcode: 'lastMessage',
              blockType: Scratch.BlockType.REPORTER,
              text: 'última mensagem',
              disableMonitor: false
            }
          ]
        };
      }

      connect({URL}) {
        if (this.socket) this.socket.close();
        this.socket = new WebSocket(URL);
        this.socket.onmessage = ({data}) => {
          latestMessages.unshift(data.toString());
          if (latestMessages.length > 5) latestMessages.pop();
        };
      }

      sendScore({TXT}) {
        if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;
        const message = JSON.stringify({m: 'set', var: 'score', value: TXT});
        this.socket.send(message);
      }

      lastMessage() {
        return latestMessages[0] || '';
      }
    }

    Scratch.extensions.register(new CloudBridge());
  }, CLOUD_PORT);

  // Helper declarados dentro do contexto do navegador.
  await page.evaluate(() => {
    window.__helpers = {
      createBlock({id, opcode, next = null, parent = null, inputs = {}, fields = {}, topLevel = false, x = 0, y = 0}) {
        return {
          [id]: {
            opcode,
            next,
            parent,
            inputs,
            fields,
            topLevel,
            x,
            y,
            shadow: false,
            children: []
          }
        };
      },
      numberInput(value) {
        return [1, [4, String(value)]];
      },
      textInput(value) {
        return [1, [10, String(value)]];
      },
      variableField(name) {
        return [name, name];
      }
    };
  });

  // Limpa o projeto padrão e cria um novo.
  await page.evaluate(async () => {
    const vm = window.vm;
    await vm.createEmptyProject();
  });

  // Adiciona as variáveis globais no palco.
  await page.evaluate(() => {
    const runtime = window.vm.runtime;
    const stage = runtime.getTargetForStage();
    stage.createVariable('score', 'score', false);
    stage.createVariable('session', 'session', false);
  });

  // Cria o palco com lógica principal (reset e condição de vitória).
  await page.evaluate(() => {
    const {createBlock, numberInput, textInput, variableField} = window.__helpers;
    const vm = window.vm;
    const stage = vm.runtime.getTargetForStage();

    const blocks = {};
    Object.assign(blocks, createBlock({id: 'stage_flag', opcode: 'event_whenflagclicked', next: 'stage_reset', topLevel: true, x: 20, y: 20}));
    Object.assign(blocks, createBlock({
      id: 'stage_reset',
      opcode: 'data_setvariableto',
      next: 'stage_session',
      parent: 'stage_flag',
      inputs: {VALUE: numberInput(0)},
      fields: {VARIABLE: variableField('score')}
    }));
    Object.assign(blocks, createBlock({
      id: 'stage_session',
      opcode: 'data_setvariableto',
      next: 'stage_connect',
      parent: 'stage_reset',
      inputs: {VALUE: textInput('sess-' + Math.random().toString(36).slice(2, 7))},
      fields: {VARIABLE: variableField('session')}
    }));
    Object.assign(blocks, createBlock({
      id: 'stage_connect',
      opcode: 'cloudbridge_connect',
      next: 'stage_loop',
      parent: 'stage_session',
      inputs: {URL: textInput('ws://localhost:3001')}
    }));
    Object.assign(blocks, createBlock({
      id: 'stage_loop',
      opcode: 'control_forever',
      parent: 'stage_connect',
      inputs: {SUBSTACK: [2, 'stage_if']}
    }));
    Object.assign(blocks, createBlock({
      id: 'stage_if',
      opcode: 'control_if',
      parent: 'stage_loop',
      inputs: {
        CONDITION: [2, 'stage_wincond'],
        SUBSTACK: [2, 'stage_message']
      }
    }));
    Object.assign(blocks, createBlock({
      id: 'stage_wincond',
      opcode: 'operator_gt',
      parent: 'stage_if',
      inputs: {OPERAND1: [3, 'score'], OPERAND2: numberInput(9)}
    }));
    Object.assign(blocks, createBlock({
      id: 'stage_message',
      opcode: 'looks_sayforsecs',
      parent: 'stage_if',
      inputs: {MESSAGE: textInput('Você venceu!'), SECS: numberInput(2)}
    }));

    stage.blocks._blocks = blocks;
  });

  // Cria sprite do jogador com blocos de movimentação e colisão.
  await page.evaluate(() => {
    const {createBlock, numberInput, textInput, variableField} = window.__helpers;
    const vm = window.vm;
    const blocks = {};

    Object.assign(blocks, createBlock({id: 'p_flag', opcode: 'event_whenflagclicked', next: 'p_position', topLevel: true, x: 60, y: 30}));
    Object.assign(blocks, createBlock({
      id: 'p_position',
      opcode: 'motion_goto',
      parent: 'p_flag',
      next: 'p_loop',
      inputs: {TO: textInput('random position')}
    }));
    Object.assign(blocks, createBlock({id: 'p_loop', opcode: 'control_forever', parent: 'p_position', inputs: {SUBSTACK: [2, 'p_if_up']}}));

    Object.assign(blocks, createBlock({
      id: 'p_if_up',
      opcode: 'control_if',
      parent: 'p_loop',
      next: 'p_if_down',
      inputs: {CONDITION: [2, 'p_cond_up'], SUBSTACK: [2, 'p_move_up']}
    }));
    Object.assign(blocks, createBlock({id: 'p_cond_up', opcode: 'sensing_keypressed', parent: 'p_if_up', inputs: {}, fields: {KEY_OPTION: ['up arrow', null]}}));
    Object.assign(blocks, createBlock({id: 'p_move_up', opcode: 'motion_changeyby', parent: 'p_if_up', inputs: {DY: numberInput(5)}}));

    Object.assign(blocks, createBlock({
      id: 'p_if_down',
      opcode: 'control_if',
      parent: 'p_loop',
      next: 'p_if_left',
      inputs: {CONDITION: [2, 'p_cond_down'], SUBSTACK: [2, 'p_move_down']}
    }));
    Object.assign(blocks, createBlock({id: 'p_cond_down', opcode: 'sensing_keypressed', parent: 'p_if_down', inputs: {}, fields: {KEY_OPTION: ['down arrow', null]}}));
    Object.assign(blocks, createBlock({id: 'p_move_down', opcode: 'motion_changeyby', parent: 'p_if_down', inputs: {DY: numberInput(-5)}}));

    Object.assign(blocks, createBlock({
      id: 'p_if_left',
      opcode: 'control_if',
      parent: 'p_loop',
      next: 'p_if_right',
      inputs: {CONDITION: [2, 'p_cond_left'], SUBSTACK: [2, 'p_move_left']}
    }));
    Object.assign(blocks, createBlock({id: 'p_cond_left', opcode: 'sensing_keypressed', parent: 'p_if_left', inputs: {}, fields: {KEY_OPTION: ['left arrow', null]}}));
    Object.assign(blocks, createBlock({id: 'p_move_left', opcode: 'motion_changexby', parent: 'p_if_left', inputs: {DX: numberInput(-5)}}));

    Object.assign(blocks, createBlock({
      id: 'p_if_right',
      opcode: 'control_if',
      parent: 'p_loop',
      next: 'p_if_touch',
      inputs: {CONDITION: [2, 'p_cond_right'], SUBSTACK: [2, 'p_move_right']}
    }));
    Object.assign(blocks, createBlock({id: 'p_cond_right', opcode: 'sensing_keypressed', parent: 'p_if_right', inputs: {}, fields: {KEY_OPTION: ['right arrow', null]}}));
    Object.assign(blocks, createBlock({id: 'p_move_right', opcode: 'motion_changexby', parent: 'p_if_right', inputs: {DX: numberInput(5)}}));

    Object.assign(blocks, createBlock({
      id: 'p_if_touch',
      opcode: 'control_if',
      parent: 'p_if_right',
      inputs: {CONDITION: [2, 'p_cond_touch'], SUBSTACK: [2, 'p_collect']}
    }));
    Object.assign(blocks, createBlock({id: 'p_cond_touch', opcode: 'sensing_touchingobject', parent: 'p_if_touch', inputs: {}, fields: {TOUCHINGOBJECTMENU: ['Gema', null]}}));
    Object.assign(blocks, createBlock({
      id: 'p_collect',
      opcode: 'control_repeat',
      parent: 'p_if_touch',
      inputs: {TIMES: numberInput(1), SUBSTACK: [2, 'p_add_score']}
    }));
    Object.assign(blocks, createBlock({
      id: 'p_add_score',
      opcode: 'data_changevariableby',
      parent: 'p_collect',
      next: 'p_send_score',
      inputs: {VALUE: numberInput(1)},
      fields: {VARIABLE: variableField('score')}
    }));
    Object.assign(blocks, createBlock({
      id: 'p_send_score',
      opcode: 'cloudbridge_sendScore',
      parent: 'p_collect',
      inputs: {TXT: [3, 'score']}
    }));

    const player = {
      isStage: false,
      name: 'Jogador',
      variables: {},
      lists: {},
      broadcasts: {},
      blocks,
      currentCostume: 0,
      costumes: [
        {
          assetId: '0c5c62c239a8e9f7f8cfd3ed891b3d93',
          name: 'Quadrado',
          bitmapResolution: 1,
          md5ext: '0c5c62c239a8e9f7f8cfd3ed891b3d93.svg',
          dataFormat: 'svg',
          rotationCenterX: 40,
          rotationCenterY: 40
        }
      ],
      sounds: [],
      layerOrder: 1,
      volume: 100,
      visible: true,
      x: 0,
      y: 0,
      size: 80,
      direction: 90,
      draggable: false,
      rotationStyle: 'all around'
    };

    vm.addSprite(JSON.stringify(player));
  });

  // Cria sprite coletável (gema) que reaparece em posições aleatórias.
  await page.evaluate(() => {
    const {createBlock, textInput} = window.__helpers;
    const vm = window.vm;
    const blocks = {};

    Object.assign(blocks, createBlock({id: 'g_flag', opcode: 'event_whenflagclicked', next: 'g_forever', topLevel: true, x: 40, y: 260}));
    Object.assign(blocks, createBlock({id: 'g_forever', opcode: 'control_forever', parent: 'g_flag', inputs: {SUBSTACK: [2, 'g_if_touch']}}));
    Object.assign(blocks, createBlock({
      id: 'g_if_touch',
      opcode: 'control_if',
      parent: 'g_forever',
      inputs: {CONDITION: [2, 'g_touch_cond'], SUBSTACK: [2, 'g_relocate']}
    }));
    Object.assign(blocks, createBlock({id: 'g_touch_cond', opcode: 'sensing_touchingobject', parent: 'g_if_touch', inputs: {}, fields: {TOUCHINGOBJECTMENU: ['Jogador', null]}}));
    Object.assign(blocks, createBlock({
      id: 'g_relocate',
      opcode: 'motion_gotoxy',
      parent: 'g_if_touch',
      inputs: {X: textInput('pick random -200 200'), Y: textInput('pick random -140 140')}
    }));

    const gem = {
      isStage: false,
      name: 'Gema',
      variables: {},
      lists: {},
      broadcasts: {},
      blocks,
      currentCostume: 0,
      costumes: [
        {
          assetId: '5a0d6d2b5f6e1e13e4ae1c57b36ad0f0',
          name: 'Gema',
          bitmapResolution: 1,
          md5ext: '5a0d6d2b5f6e1e13e4ae1c57b36ad0f0.svg',
          dataFormat: 'svg',
          rotationCenterX: 40,
          rotationCenterY: 40
        }
      ],
      sounds: [],
      layerOrder: 2,
      volume: 100,
      visible: true,
      x: 100,
      y: 0,
      size: 60,
      direction: 90,
      draggable: false,
      rotationStyle: 'all around'
    };

    vm.addSprite(JSON.stringify(gem));
  });

  // Inicia o jogo (bandeira verde) e salva o projeto como .sb3.
  const arrayBuffer = await page.evaluate(async () => {
    const vm = window.vm;
    vm.greenFlag();
    const sb3 = await vm.saveProjectSb3();
    return Array.from(new Uint8Array(sb3));
  });

  await fs.promises.mkdir(path.dirname(PROJECT_PATH), {recursive: true});
  const buffer = Buffer.from(arrayBuffer);
  fs.writeFileSync(PROJECT_PATH, buffer);
  console.log(`Projeto salvo em ${PROJECT_PATH}`);
}

// ---------------------------------------------
// 3) Execução principal com Puppeteer
// ---------------------------------------------
async function main() {
  const cloudServer = startCloudServer();

  const browser = await puppeteer.launch({headless: 'new', args: ['--disable-features=IsolateOrigins,site-per-process']});
  const [page] = await browser.pages();

  try {
    await buildProject(page);
  } finally {
    await browser.close();
    cloudServer.close();
  }
}

main().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
