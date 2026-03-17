#!/usr/bin/env node

const { flashFirmware, listDevices } = require('./flash');
const { listFirmware } = require('./list');
const { compileFirmware, setConfig, showConfig } = require('./compile');
const { loadToolsConfig, loadConfig } = require('./utils');
const { showSerialList, openAndMonitorPort } = require('./serial');

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
  monitor [选项]        打开串口并监控数据
    -p, --port <端口>   串口端口（例如: COM107，不指定则使用默认配置）
    --baud, -b <rate>   设置波特率（默认 115200）
    --timeout, -t <ms>  设置超时时间（毫秒，默认 0 表示不超时）
    --output, -o <file> 输出到文件
    --append, -a        追加到文件（默认覆盖）
    --include <keywords> 包含关键词（逗号分隔）
    --exclude <keywords> 排除关键词（逗号分隔）
    --until <text>      收到此内容后退出
    --until-regex <pattern> 正则匹配后退出
    --lines <n>         捕获 n 行后退出
    --json              以 JSON 格式输出结果
    --timestamp         为每行添加时间戳
  build [命令]         编译固件
  build-and-flash      编译并烧录最新固件
  config               显示当前配置
  config set <key> <value>  设置配置项
  help                 显示帮助信息

示例:
  firmware-cli.exe flash
  firmware-cli.exe build
  firmware-cli.exe build-and-flash
  firmware-cli.exe list
  firmware-cli.exe serial
  firmware-cli.exe monitor -p COM9
  firmware-cli.exe monitor -p COM9 -b 9600 -t 5000
  firmware-cli.exe monitor -p COM9 --include "ERROR,WARN" -o errors.log
  firmware-cli.exe monitor -p COM9 --until "Done" -o boot.log
  firmware-cli.exe monitor -p COM9 --lines 100 -o debug.log
  firmware-cli.exe monitor -p COM9 --json --timeout 5000

配置文件:
  firmware-cli.json (在项目根目录)

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
            case 'monitor':
                // 解析选项
                const getArgValue = (short, long) => {
                    const index = args.findIndex(arg => arg === short || arg === long);
                    return index !== -1 ? args[index + 1] : null;
                };
                const hasFlag = (short, long) => args.includes(short) || args.includes(long);
                
                // 获取端口：优先使用 -p 选项，否则使用配置默认值
                let portPath = getArgValue('-p', '--port');
                let portSource = 'user_input';
                
                // 如果没有指定端口，尝试读取配置
                if (!portPath) {
                    const config = loadConfig();
                    if (config.defaultComPort) {
                        portPath = config.defaultComPort;
                        portSource = 'config_default';
                    }
                }
                
                if (!portPath) {
                    throw new Error('请使用 -p 指定串口（例如: -p COM107），或在 firmware-cli.json 中配置 defaultComPort');
                }
                
                const monitorOptions = {
                    baudRate: parseInt(getArgValue('-b', '--baud')) || 115200,
                    timeout: parseInt(getArgValue('-t', '--timeout')) || 0,
                    output: getArgValue('-o', '--output'),
                    append: hasFlag('-a', '--append'),
                    include: getArgValue(null, '--include'),
                    exclude: getArgValue(null, '--exclude'),
                    until: getArgValue(null, '--until'),
                    untilRegex: getArgValue(null, '--until-regex'),
                    lines: parseInt(getArgValue(null, '--lines')) || 0,
                    json: hasFlag(null, '--json'),
                    timestamp: hasFlag(null, '--timestamp')
                };
                
                // 如果使用配置默认值，输出提示（非 JSON 模式）
                if (portSource === 'config_default' && !monitorOptions.json) {
                    console.log(`\n📌 使用配置的默认串口: ${portPath}\n`);
                }
                
                await openAndMonitorPort(portPath, monitorOptions);
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
