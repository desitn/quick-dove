const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { 
    tool_set, 
    getToolsPath, 
    isWindows, 
    determineFirmwareType,
    killProcessTree,
    executeCommand,
    iconv
} = require('./utils');
const iconvLite = require('iconv-lite');

/**
 * 烧录固件
 * @param {string} firmwarePath - 固件路径（可选，如果不提供则自动查找）
 */
async function flashFirmware(firmwarePath = null) {
    try {
        console.log('🔥 固件烧录工具');
        console.log('='.repeat(50));
        
        // 确定固件路径
        let filePath = firmwarePath;
        if (!filePath) {
            console.log('🔍 自动查找固件...');
            filePath = await findFirmwarePath();
            if (!filePath) {
                throw new Error('未找到固件文件，请指定固件路径或配置.firmware-cli.json文件');
            }
        }
        
        // 检查文件是否存在
        if (!fs.existsSync(filePath)) {
            throw new Error(`固件文件不存在: ${filePath}`);
        }
        
        console.log(`📦 固件路径: ${filePath}`);
        
        // 确定固件类型
        console.log('🔍 分析固件类型...');
        const firmwareInfo = determineFirmwareType(filePath);
        console.log(`✅ 固件类型: ${firmwareInfo.type.toUpperCase()}`);
        
        // 检查下载工具
        const toolsPath = getToolsPath();
        const toolName = tool_set[firmwareInfo.type];
        const toolPath = path.join(toolsPath, toolName);
        
        if (!fs.existsSync(toolPath)) {
            throw new Error(`下载工具不存在: ${toolPath}`);
        }
        console.log(`🔧 下载工具: ${toolName}`);
        
        // 执行烧录
        console.log('🚀 开始烧录...');
        console.log('='.repeat(50));
        
        await executeFlash(toolPath, firmwareInfo.type, firmwareInfo.file);
        
        console.log('='.repeat(50));
        console.log('✅ 烧录完成！');
        
    } catch (error) {
        console.error('❌ 烧录失败:', error.message);
        process.exit(1);
    }
}

/**
 * 查找固件路径
 */
async function findFirmwarePath() {
    const { findFirmwareAuto } = require('./utils');
    return findFirmwareAuto();
}

/**
 * 执行烧录命令
 */
async function executeFlash(toolPath, toolType, firmwareFile) {
    return new Promise(async (resolve, reject) => {
        let command, cmdStr, args;
        
        if (isWindows()) {
            command = 'cmd';
            
            // 完全按照extension.js的方式：不加引号，不转换路径
            switch (toolType) {
                case 'ad':
                    cmdStr = `${toolPath} -r -q -a -u -s 115200 ${firmwareFile}`;
                    break;
                case 'pac':
                    cmdStr = `${toolPath} -pac ${firmwareFile}`;
                    break;
                case 'ecf':
                    cmdStr = `${toolPath} -f ${firmwareFile} --timeout 60`;
                    break;
                case 'fbf':
                default:
                    cmdStr = `${toolPath} -b ${firmwareFile}`;
                    break;
            }
            
            args = ['/c', cmdStr];
        } else {
            // Unix-like systems
            command = toolPath;
            
            switch (toolType) {
                case 'ad':
                    args = ['-r', '-q', '-a', '-u', '-s', '115200', firmwareFile];
                    break;
                case 'pac':
                    args = ['-pac', firmwareFile];
                    break;
                case 'ecf':
                    args = ['-f', firmwareFile, '--timeout', '60'];
                    break;
                case 'fbf':
                default:
                    args = ['-b', firmwareFile];
                    break;
            }
        } 
        
        console.log(`执行命令: ${command} ${args.join(' ')}`);
        
        const child = spawn(command, args, { shell: true });
        let downloadComplete = false;
        
        // 30秒超时
        const timeout = setTimeout(() => {
            if (!downloadComplete) {
                console.log('⏱️  等待超时，终止下载进程');
                killProcessTree(child, 'SIGKILL');
            }
        }, 30000);
        
        // 监听stdout
        child.stdout.on('data', (data) => {
            let output;
            if (isWindows()) {
                output = iconvLite.decode(data, 'gbk');
            } else {
                output = data.toString('utf8');
            }
            
            // 检测到下载开始
            if (output.includes('Downloading') || 
                output.includes('Download percentage') ||
                output.includes('DownLoading')) {
                clearTimeout(timeout);
                downloadComplete = true;
            }
            
            process.stdout.write(output);
        });
        
        // 监听stderr
        child.stderr.on('data', (data) => {
            let errorOutput;
            if (isWindows()) {
                errorOutput = iconvLite.decode(data, 'gbk');
            } else {
                errorOutput = data.toString('utf8');
            }
            process.stderr.write(errorOutput);
        });
        
        // 监听进程关闭
        child.on('close', (code) => {
            clearTimeout(timeout);
            
            if (code === 0) {
                console.log('\n✅ 下载进程成功退出');
                resolve();
            } else {
                reject(new Error(`下载进程失败，退出码: ${code}`));
            }
        });
        
        // 监听错误
        child.on('error', (error) => {
            clearTimeout(timeout);
            reject(new Error(`启动下载进程失败: ${error.message}`));
        });
    });
}

/**
 * 列出USB设备
 */
async function listDevices() {
    if (!isWindows()) {
        console.log('⚠️  设备列表功能仅在Windows上可用');
        return [];
    }
    
    console.log('🔌 查找USB设备...');
    console.log('='.repeat(50));
    
    const command = 'wmic path Win32_PnPEntity where "Name like \'%USB%\' OR Name like \'%Quectel%\'" get Name';
    
    try {
        const { stdout } = await executeCommand('cmd', ['/c', command], { silent: true });
        
        const lines = stdout.split('\n');
        const devices = [];
        
        for (const line of lines) {
            const trimmedLine = line.trim();
            if (trimmedLine && 
                !trimmedLine.includes('Name') &&
                trimmedLine.length > 0) {
                // 过滤掉非设备条目
                if (!(trimmedLine.includes('Keyboard') || 
                      trimmedLine.includes('Mouse') || 
                      trimmedLine.includes('Controller') ||
                      trimmedLine.includes('Input') ||
                      trimmedLine.includes('Hub') ||
                      trimmedLine.includes('Oray') ||
                      trimmedLine.includes('ECM') ||
                      trimmedLine.includes('Composite Device') ||
                      trimmedLine.includes('输入设备') ||
                      trimmedLine.includes('集线器') ||
                      trimmedLine.includes('主机控制器'))) {
                    devices.push(trimmedLine);
                }
            }
        }
        
        if (devices.length === 0) {
            console.log('⚠️  未找到USB设备');
        } else {
            devices.sort((a, b) => a.localeCompare(b));
            console.log(`✅ 找到 ${devices.length} 个设备:\n`);
            devices.forEach((device, index) => {
                console.log(`${index + 1}. ${device}`);
            });
        }
        
        return devices;
    } catch (error) {
        console.error('❌ 获取设备列表失败:', error.message);
        return [];
    }
}

module.exports = {
    flashFirmware,
    listDevices
};