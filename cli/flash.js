const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const readline = require('readline');
const { 
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
 * 获取平台类型对应的进度匹配词配置
 * @param {string} toolType - 工具类型
 */
function getProgressPatterns(toolType) {
    const config = loadToolsConfig();
    
    // 根据工具类型查找对应平台
    let platformKey = null;
    for (const [key, platform] of Object.entries(config.platforms || {})) {
        if (platform.type === toolType) {
            platformKey = key;
            break;
        }
    }
    
    // 获取平台配置
    const platformConfig = platformKey ? config.platforms[platformKey] : null;
    
    // 返回配置或默认配置
    return platformConfig?.progressPatterns || {
        started: ['init', 'start', 'begin'],
        downloading: ['downloading', 'running', 'burning', 'flashing'],
        completed: ['complete', 'success', ,'finished'],
        error: ['error', 'fail', 'timeout']
    };
}

/**
 * 格式化下载进度 - 统一不同工具的进度显示
 * 从配置读取匹配词，只返回状态（无进度条）
 * 如果"已开始"未命中，则不判断其他状态
 */
function formatDownloadProgress(output, toolType, hasStartedRef) {
    // 获取平台配置的匹配词
    const patterns = getProgressPatterns(toolType);
    
    // 提取状态信息
    let status = null;
    const lowerOutput = output.toLowerCase();
    
    // 1. 检查已开始
    for (const pattern of patterns.started) {
        if (lowerOutput.includes(pattern.toLowerCase())) {
            status = '📥 已开始';
            hasStartedRef.value = true;  // 标记已进入开始状态
            break;
        }
    }
    
    // 如果已开始未命中，则不判断其他状态
    if (!hasStartedRef.value) {
        return null;
    }
    
    // 2. 检查下载中
    if (!status) {
        for (const pattern of patterns.downloading) {
            if (lowerOutput.includes(pattern.toLowerCase())) {
                status = '📥 下载中';
                break;
            }
        }
    }
    
    // 3. 检查完成
    if (!status) {
        for (const pattern of patterns.completed) {
            if (lowerOutput.includes(pattern.toLowerCase())) {
                status = '✅ 完成';
                break;
            }
        }
    }
    
    // 4. 检查错误
    if (!status) {
        for (const pattern of patterns.error) {
            if (lowerOutput.includes(pattern.toLowerCase())) {
                status = '❌ 错误';
                break;
            }
        }
    }
    
    // 返回状态（无进度条）
    if (status) {
        return `\n${status}`;
    }
    
    return null;
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
        
        const child = spawn(command, args, { 
            shell: true,
            stdio: ['ignore', 'pipe', 'pipe']
        });
        let downloadComplete = false;
        
        // 30秒超时
        const timeout = setTimeout(() => {
            if (!downloadComplete) {
                console.log('⏱️  等待超时，终止下载进程');
                killProcessTree(child, 'SIGKILL');
            }
        }, 30000);
        
        // 创建日志文件记录工具原始输出
        const logFile = path.join(process.cwd(), 'frimware-cli-tool.log');
        const logStream = fs.createWriteStream(logFile, { flags: 'w' });
        
        // 使用 readline 逐行处理 stdout
        let lastProgress = '';
        let lastStatus = '';  // 记录上一个状态，避免重复输出
        const hasStartedRef = { value: false };  // 引用对象，用于跟踪是否已进入开始状态
        
        const stdoutRl = readline.createInterface({
            input: child.stdout,
            crlfDelay: Infinity
        });
        
        stdoutRl.on('line', (line) => {
            // 解码（Windows 下需要 GBK 解码）
            let output;
            if (isWindows()) {
                output = iconvLite.decode(Buffer.from(line, 'binary'), 'gbk');
            } else {
                output = line;
            }
            
            // 记录工具原本的日志到文件（每行带时间戳）
            const timestamp = new Date().toISOString();
            logStream.write(`[${timestamp}] ${output}\n`);

            // 尝试格式化进度显示
            const progress = formatDownloadProgress(output, toolType, hasStartedRef);
            
            // 检测到下载开始（基于格式化后的状态）
            if (progress && !downloadComplete) {
                clearTimeout(timeout);
                downloadComplete = true;
            }
            
            if (progress) {
                // 状态信息：只有状态变化时才输出
                const currentStatus = progress.trim();
                if (currentStatus !== lastStatus) {
                    process.stdout.write(progress);
                    lastStatus = currentStatus;
                }
            }
        });
        
        // 使用 readline 逐行处理 stderr
        const stderrRl = readline.createInterface({
            input: child.stderr,
            crlfDelay: Infinity
        });
        
        stderrRl.on('line', (line) => {
            // 解码（Windows 下需要 GBK 解码）
            let errorOutput;
            if (isWindows()) {
                errorOutput = iconvLite.decode(Buffer.from(line, 'binary'), 'gbk');
            } else {
                errorOutput = line;
            }
            
            // 记录错误输出到日志（每行带时间戳）
            const timestamp = new Date().toISOString();
            logStream.write(`[${timestamp}] [STDERR] ${errorOutput}\n`);
            process.stderr.write(errorOutput + '\n');
        });
        
        // 监听进程关闭
        child.on('close', (code) => {
            clearTimeout(timeout);
            // 关闭日志流
            logStream.end(`\n[进程退出，退出码: ${code}]\n`);
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