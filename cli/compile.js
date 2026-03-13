const fs = require('fs');
const path = require('path');
const { 
    findWorkspacePath, 
    loadConfig, 
    saveConfig,
    isWindows,
    executeCommand
} = require('./utils');

/**
 * 编译固件
 * @param {string} buildCommand - 构建命令（可选）
 */
async function compileFirmware(buildCommand = null) {
    try {
        console.log('🔨 固件编译工具');
        console.log('='.repeat(50));
        
        // 查找工作空间
        const workspacePath = findWorkspacePath();
        if (!workspacePath) {
            throw new Error('未找到工作空间，请在项目根目录下执行');
        }
        
        console.log(`📂 工作空间: ${workspacePath}`);
        
        // 确定构建命令
        let command = buildCommand;
        if (!command) {
            console.log('🔍 自动查找构建命令...');
            command = await findBuildCommand(workspacePath);
            if (!command) {
                throw new Error('未找到构建命令，请指定或配置.firmware-cli.json文件');
            }
        }
        
        console.log(`🔧 构建命令: ${command}`);
        console.log('='.repeat(50));
        
        // 执行编译
        await executeBuild(workspacePath, command);
        
        console.log('='.repeat(50));
        console.log('✅ 编译完成！');
        
    } catch (error) {
        console.error('❌ 编译失败:', error.message);
        process.exit(1);
    }
}

/**
 * 查找构建命令
 */
async function findBuildCommand(workspacePath) {
    // 1. 检查配置文件
    const config = loadConfig();
    if (config.buildCommand) {
        return config.buildCommand;
    }
    
    // 2. 查找build*OPTfile.bat文件
    const batPattern = 'build*OPTfile.bat';
    const batFiles = fs.readdirSync(workspacePath).filter(file => 
        file.toLowerCase().startsWith('build') && 
        file.toLowerCase().includes('optfile') &&
        file.toLowerCase().endsWith('.bat')
    );
    
    if (batFiles.length > 0) {
        console.log(`找到批处理文件: ${batFiles[0]}`);
        return batFiles[0];
    }
    
    // 3. 查找build*OPTfile.sh文件
    const shPattern = 'build*OPTfile.sh';
    const shFiles = fs.readdirSync(workspacePath).filter(file => 
        file.toLowerCase().startsWith('build') && 
        file.toLowerCase().includes('optfile') &&
        file.toLowerCase().endsWith('.sh')
    );
    
    if (shFiles.length > 0) {
        console.log(`找到Shell脚本: ${shFiles[0]}`);
        return shFiles[0];
    }
    
    return null;
}

/**
 * 执行构建
 */
async function executeBuild(workspacePath, buildCommand) {
    const config = loadConfig();
    const bashPath = config.buildGitBashPath;
    
    let taskCmd, args;
    const isBash = buildCommand.toLowerCase().endsWith('.sh');
    
    if (isWindows()) {
        if (isBash) {
            // 使用Git Bash
            if (!bashPath || !fs.existsSync(bashPath)) {
                throw new Error('Shell脚本需要Git Bash，请在配置文件中设置buildGitBashPath');
            }
            taskCmd = bashPath;
            args = ['-c', `./${buildCommand}`];
            console.log(`使用Git Bash: ${bashPath}`);
        } else {
            // 使用cmd
            taskCmd = 'cmd';
            args = ['/c', buildCommand];
        }
    } else {
        // Unix-like系统
        taskCmd = '/bin/bash';
        args = ['-c', buildCommand];
    }
    
    console.log(`\n执行命令: ${taskCmd} ${args.join(' ')}`);
    console.log('='.repeat(50));
    
    try {
        await executeCommand(taskCmd, args, {
            cwd: workspacePath,
            shell: true
        });
    } catch (error) {
        throw new Error(`构建命令执行失败: ${error.message}`);
    }
}

/**
 * 设置配置
 */
async function setConfig(key, value) {
    const config = loadConfig();
    
    if (key === 'firmwarePath') {
        config.firmwarePath = value;
        console.log(`✅ 设置固件路径: ${value}`);
    } else if (key === 'buildCommand') {
        config.buildCommand = value;
        console.log(`✅ 设置构建命令: ${value}`);
    } else if (key === 'buildGitBashPath') {
        config.buildGitBashPath = value;
        console.log(`✅ 设置Git Bash路径: ${value}`);
    } else {
        throw new Error(`未知的配置项: ${key}`);
    }
    
    saveConfig(config);
    console.log('💡 配置已保存到 .firmware-cli.json');
}

/**
 * 显示配置
 */
async function showConfig() {
    const config = loadConfig();
    
    console.log('⚙️  当前配置');
    console.log('='.repeat(50));
    console.log(`固件路径: ${config.firmwarePath || '未设置'}`);
    console.log(`构建命令: ${config.buildCommand || '未设置'}`);
    console.log(`Git Bash: ${config.buildGitBashPath || '未设置'}`);
    console.log('='.repeat(50));
    console.log('\n💡 设置配置:');
    console.log('  node cli/index.js config set firmwarePath <路径>');
    console.log('  node cli/index.js config set buildCommand <命令>');
    console.log('  node cli/index.js config set buildGitBashPath <路径>');
}

module.exports = {
    compileFirmware,
    setConfig,
    showConfig
};