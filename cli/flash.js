const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { 
    getToolsPath, 
    getToolPath,
    buildToolArgs,
    getGlobalSettings,
    loadToolsConfig,
    isWindows, 
    determineFirmwareType,
    killProcessTree,
    executeCommand
} = require('./utils');
const iconvLite = require('iconv-lite');
const { enterDownloadMode, findDownloadPort } = require('./serial');

/**
 * 烧录固件
 * @param {string} firmwarePath - 固件路径（可选，如果不提供则自动查找）
 * @param {Object} options - 选项
 * @param {boolean} options.skipDlMode - 是否跳过自动进入下载模式
 */
async function flashFirmware(firmwarePath = null, options = {}) {
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
        
        // 根据工具类型查找平台配置
        const config = loadToolsConfig();
        let platformKey = null;
        let platformConfig = null;
        
        for (const [key, platform] of Object.entries(config.platforms || {})) {
            if (platform.type === firmwareInfo.type) {
                platformKey = key;
                platformConfig = platform;
                break;
            }
        }
        
        // 自动进入下载模式（如果配置允许且未跳过）
        if (!options.skipDlMode && platformConfig?.serial?.autoEnterDlMode) {
            console.log('🔌 检查下载模式...');
            const dlPort = await findDownloadPort(platformKey);
            if (!dlPort) {
                console.log('⚠️ 未检测到下载端口，自动尝试进入下载模式');
                const result = await enterDownloadMode(platformKey || firmwareInfo.type, false, 2);
                if (!result.success) {
                    console.log('⚠️ 自动进入下载模式失败，请手动进入下载模式后重试');
                    console.log('   继续执行烧录...');
                }
                if (result.skipped) {
                    console.log(`⚠️ ${result.reason}`);
                }
            } else {
                console.log(`✅ 设备已在下载模式: ${dlPort.path}`);
                if (dlPort.type === 'bus') {
                    console.log(`   类型: 总线设备 (${dlPort.description})`);
                } else {
                    console.log(`   类型: 串口设备`);
                }
            }
        }
        
        // 检查下载工具
        const toolPath = getToolPath(firmwareInfo.type);
        
        if (!fs.existsSync(toolPath)) {
            throw new Error(`下载工具不存在: ${toolPath}`);
        }
        console.log(`🔧 下载工具: ${firmwareInfo.type}`);
        
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
 * 格式化下载进度 - 统一不同工具的进度显示
 */
function formatDownloadProgress(output, toolType) {
    // 提取进度百分比
    const percentMatch = output.match(/(\d+)%/);
    const percent = percentMatch ? parseInt(percentMatch[1]) : null;
    
    // 提取状态信息
    let status = null;
    const lowerOutput = output.toLowerCase();
    
    // ASR 下载工具特定输出
    if (lowerOutput.includes('downloading') || lowerOutput.includes('running')) {
        status = '📥 下载中';
    } else if (lowerOutput.includes('complete') || lowerOutput.includes('完成') || lowerOutput.includes('success')) {
        status = '✅ 完成';
    } else if (lowerOutput.includes('error') || lowerOutput.includes('错误') || lowerOutput.includes('fail')) {
        status = '❌ 错误';
    } else if (lowerOutput.includes('connect') || lowerOutput.includes('连接')) {
        status = '🔗 连接中';
    } else if (lowerOutput.includes('erase') || lowerOutput.includes('擦除')) {
        status = '🧹 擦除中';
    } else if (lowerOutput.includes('write') || lowerOutput.includes('写入')) {
        status = '✏️  写入中';
    } else if (lowerOutput.includes('verify') || lowerOutput.includes('校验')) {
        status = '🔍 校验中';
    }
    
    // 如果有百分比，显示进度条
    if (percent !== null && percent >= 0 && percent <= 100) {
        const filled = Math.floor(percent / 5);
        const empty = 20 - filled;
        const bar = '█'.repeat(filled) + '░'.repeat(empty);
        return `\r[${bar}] ${percent.toString().padStart(3)}% ${status || ''}`;
    }
    
    // 如果没有百分比但有状态，显示状态
    if (status) {
        return `\n${status}`;
    }
    
    return null;
}

/**
 * 过滤冗余日志 - 只保留关键信息
 */
function shouldShowLog(output, toolType) {
    const lowerOutput = output.toLowerCase();
    
    // ASR 下载工具的输出通常不需要显示（进度由 formatDownloadProgress 处理）
    if (toolType === 'ad') {
        // 只显示错误和完成信息
        if (lowerOutput.includes('error') || 
            lowerOutput.includes('fail') ||
            lowerOutput.includes('complete') ||
            lowerOutput.includes('success')) {
            return true;
        }
        return false;
    }
    
    // 过滤掉常见的冗余信息
    const skipPatterns = [
        /copyright/i,
        /version/i,
        /build date/i,
        /^\s*$/,
        /loading/i,
        /initializing/i,
    ];
    
    for (const pattern of skipPatterns) {
        if (pattern.test(output)) return false;
    }
    
    return true;
}

/**
 * 执行烧录命令
 */
async function executeFlash(toolPath, toolType, firmwareFile) {
    return new Promise(async (resolve, reject) => {
        let command, args;
        
        // 从配置获取全局设置
        const settings = getGlobalSettings();
        const port = settings.defaultPort || 'auto';
        
        if (isWindows()) {
            command = 'cmd';
            
            // 使用 buildToolArgs 从 JSON 配置构建参数
            const toolArgs = buildToolArgs(toolType, 'flash', {
                firmwarePath: firmwareFile,
                port: port
            });
            
            // Windows 下需要构建命令字符串
            const cmdStr = `"${toolPath}" ${toolArgs.join(' ')}`;
            args = ['/c', cmdStr];
        } else {
            // Unix-like systems
            command = toolPath;
            
            // 使用 buildToolArgs 从 JSON 配置构建参数
            args = buildToolArgs(toolType, 'flash', {
                firmwarePath: firmwareFile,
                port: port
            });
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
        let lastProgress = '';
        let lastStatus = '';  // 记录上一个状态，避免重复输出
        child.stdout.on('data', (data) => {
            let output;
            if (isWindows()) {
                output = iconvLite.decode(data, 'gbk');
            } else {
                output = data.toString('utf8');
            }
            
            // 调试：显示原始输出（用于分析进度格式）
            //console.log('[DEBUG] Raw output:', JSON.stringify(output));
            
            // 检测到下载开始
            if (output.includes('Downloading') || 
                output.includes('Download percentage') ||
                output.includes('DownLoading')) {
                clearTimeout(timeout);
                downloadComplete = true;
            }
            
            // 尝试格式化进度显示
            const progress = formatDownloadProgress(output, toolType);
            if (progress) {
                // 如果是进度条，在同一行更新
                if (progress.startsWith('\r')) {
                    process.stdout.write(progress);
                    lastProgress = progress;
                } else {
                    // 状态信息：只有状态变化时才输出
                    const currentStatus = progress.trim();
                    if (currentStatus !== lastStatus) {
                        if (lastProgress) {
                            process.stdout.write('\n');
                            lastProgress = '';
                        }
                        process.stdout.write(progress);
                        lastStatus = currentStatus;
                    }
                }
            }
            // 其他输出不显示（正向过滤：只显示命中关键词的）
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