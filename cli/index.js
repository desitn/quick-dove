#!/usr/bin/env node

const { flashFirmware, listDevices } = require('./flash');
const { listFirmware } = require('./list');
const { compileFirmware, setConfig, showConfig } = require('./compile');
const { loadToolsConfig } = require('./utils');
const { enterDownloadMode, showSerialList } = require('./serial');

/**
 * 生成支持的固件类型列表（从JSON配置读取）
 */
function generateSupportedTypes() {
    try {
        const config = loadToolsConfig();
        const platforms = config.platforms || {};
        
        let lines = [];
        for (const [key, platform] of Object.entries(platforms)) {
            const extensions = platform.extensions || [];
            const extStr = extensions.map(e => `*${e}`).join(', ');
            lines.push(`  - ${platform.description || key}: ${extStr}`);
        }
        
        return lines.join('\n') || '  - 暂无配置';
    } catch (error) {
        return '  - 配置加载失败';
    }
}

/**
 * 显示帮助信息
 */
function showHelp() {
    const supportedTypes = generateSupportedTypes();
    
    console.log(`
固件编译和烧录CLI工具 v1.0.0

使用方法:
  firmware-cli.exe <命令> [参数]

命令:
  flash [路径] [选项]  烧录固件（自动查找或指定路径）
    --skip-dl-mode, -s  跳过自动进入下载模式
  list                 列出可用固件
  devices              列出USB设备
  serial               列出串口设备
  enter-dl-mode [类型] [选项]  进入下载模式
  build [命令]         编译固件
  build-and-flash      编译并烧录最新固件
  config               显示当前配置
  config set <key> <value>  设置配置项
  help                 显示帮助信息

示例:
  firmware-cli.exe flash
  firmware-cli.exe flash "C:/path/firmware.bin"
  firmware-cli.exe flash --skip-dl-mode
  firmware-cli.exe list
  firmware-cli.exe serial
  firmware-cli.exe enter-dl-mode asr
  firmware-cli.exe enter-dl-mode unisoc --force
  firmware-cli.exe build
  firmware-cli.exe build-and-flash

配置文件:
  .firmware-cli.json (在项目根目录)

支持的固件类型:
${supportedTypes}
`);
}

/**
 * 主函数
 */
async function main() {
    const command = process.argv[2];
    const args = process.argv.slice(3);
    
    try {
        switch (command) {
            case 'flash':
                const skipDlMode = args.includes('--skip-dl-mode') || args.includes('-s');
                const firmwarePath = args.find(arg => !arg.startsWith('-')) || null;
                await flashFirmware(firmwarePath, { skipDlMode });
                break;
            case 'list':
                await listFirmware();
                break;
            case 'devices':
                await listDevices();
                break;
            case 'serial':
                await showSerialList();
                break;
            case 'enter-dl-mode':
                const platform = args[0] || 'asr';
                const force = args.includes('--force') || args.includes('-f');
                const timeoutArg = args.find((arg, index) => (arg === '--timeout' || arg === '-t') && args[index + 1]);
                const timeout = timeoutArg ? parseInt(args[args.indexOf(timeoutArg) + 1]) : 2;
                await enterDownloadMode(platform, force, timeout);
                break;
            case 'build':
                await compileFirmware(args[0] || null);
                break;
            case 'build-and-flash':
                await compileFirmware(args[0] || null);
                await flashFirmware(null);
                break;
            case 'config':
                if (args[0] === 'set' && args.length >= 3) {
                    await setConfig(args[1], args[2]);
                } else {
                    await showConfig();
                }
                break;
            case 'help':
            case '--help':
            case '-h':
                showHelp();
                break;
            default:
                if (!command) {
                    showHelp();
                } else {
                    throw new Error(`未知命令: ${command}`);
                }
        }
    } catch (error) {
        console.error('错误:', error.message);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}

module.exports = { main, showHelp };