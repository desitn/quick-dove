#!/usr/bin/env node

const { flashFirmware, listDevices } = require('./flash');
const { listFirmware } = require('./list');
const { compileFirmware, setConfig, showConfig } = require('./compile');

/**
 * 显示帮助信息
 */
function showHelp() {
    console.log(`
固件编译和烧录CLI工具 v1.0.0

使用方法:
  firmware-cli.exe <命令> [参数]

命令:
  flash [路径]         烧录固件（自动查找或指定路径）
  list                 列出可用固件
  devices              列出USB设备
  build [命令]         编译固件
  build-and-flash      编译并烧录最新固件
  config               显示当前配置
  config set <key> <value>  设置配置项
  help                 显示帮助信息

示例:
  firmware-cli.exe flash
  firmware-cli.exe flash "C:/path/firmware.bin"
  firmware-cli.exe list
  firmware-cli.exe build
  firmware-cli.exe build-and-flash

配置文件:
  .firmware-cli.json (在项目根目录)

支持的固件类型:
  - ASR 160X: *.zip
  - ASR 180X/190X: *_fbf.bin
  - UNISOC 8310/8910/8850: *.pac
  - Eigen 618/718: *_download_usb.ini
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
                await flashFirmware(args[0] || null);
                break;
            case 'list':
                await listFirmware();
                break;
            case 'devices':
                await listDevices();
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