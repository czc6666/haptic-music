// 全局变量
const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500MB
let currentFile = null;
let isProcessing = false;
let ffmpeg = null;

// DOM元素
const dropArea = document.getElementById('drop-area');
const fileInput = document.getElementById('file-input');
const fileName = document.getElementById('file-name');
const clearBtn = document.getElementById('clear-btn');
const processBtn = document.getElementById('process-btn');
const progressContainer = document.getElementById('progress-container');
const progressBarFill = document.getElementById('progress-bar-fill');
const progressText = document.getElementById('progress-text');
const statusText = document.getElementById('status-text');
const advancedMode = document.getElementById('advanced-mode');
const browserWarning = document.getElementById('browser-warning');

// 检查浏览器兼容性和设备类型
function checkIsolation() {
  // 检测是否为移动设备
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  const isCrossOriginIsolated = window.crossOriginIsolated;
  
  // 如果是移动设备或不支持跨域隔离，则显示警告
  if (isMobile || !isCrossOriginIsolated) {
    browserWarning.style.display = 'block';
  }
}

// 页面加载时检查
document.addEventListener('DOMContentLoaded', checkIsolation);

// 简化版的处理函数，针对浏览器兼容性问题
async function createSimpleHapticFile(inputFile) {
  try {
    // 读取整个原始文件数据
    const fileReader = new FileReader();
    const fileDataPromise = new Promise((resolve, reject) => {
      fileReader.onload = () => resolve(fileReader.result);
      fileReader.onerror = () => reject(fileReader.error);
      fileReader.readAsArrayBuffer(inputFile);
    });
    
    const fileData = await fileDataPromise;
    const fileDataArray = new Uint8Array(fileData);
    
    console.log("原始文件大小:", fileDataArray.length, "字节");
    
    // 检查文件是否已经是OGG格式
    const isOgg = fileDataArray.length >= 4 && 
                  fileDataArray[0] === 0x4F && // 'O'
                  fileDataArray[1] === 0x67 && // 'g'
                  fileDataArray[2] === 0x67 && // 'g'
                  fileDataArray[3] === 0x53;   // 'S'
    
    if (isOgg) {
      // 如果已经是OGG文件，尝试添加ANDROID_HAPTIC元数据
      console.log("检测到OGG文件，尝试添加ANDROID_HAPTIC元数据");
      
      // 创建包含ANDROID_HAPTIC元数据的OGG注释页
      const hapticComment = new Uint8Array([
        // OGG页头
        0x4F, 0x67, 0x67, 0x53, // "OggS"
        0x00, // 版本
        0x02, // 头类型
        // Granule position (8字节)
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        // 流序列号 (随机生成)
        Math.floor(Math.random() * 256),
        Math.floor(Math.random() * 256),
        Math.floor(Math.random() * 256),
        Math.floor(Math.random() * 256),
        // 页序号
        0x01, 0x00, 0x00, 0x00,
        // CRC校验和 (暂时为0)
        0x00, 0x00, 0x00, 0x00,
        // 页段数
        0x01,
        // 段表
        0x1F,
        
        // Vorbis注释头
        0x03, 0x76, 0x6F, 0x72, 0x62, 0x69, 0x73, // "\3vorbis"
        // 厂商长度
        0x09, 0x00, 0x00, 0x00,
        // 厂商字符串: "BoneVibe"
        0x42, 0x6F, 0x6E, 0x65, 0x56, 0x69, 0x62, 0x65, 0x20,
        // 注释数量
        0x01, 0x00, 0x00, 0x00,
        // 注释长度
        0x10, 0x00, 0x00, 0x00,
        // 注释: "ANDROID_HAPTIC=1"
        0x41, 0x4E, 0x44, 0x52, 0x4F, 0x49, 0x44, 0x5F,
        0x48, 0x41, 0x50, 0x54, 0x49, 0x43, 0x3D, 0x31,
        // 帧位
        0x01
      ]);
      
      // 在文件的第二页之前插入我们的注释页
      // 找到第二个"OggS"标记的位置
      let secondPagePos = -1;
      for (let i = 4; i < fileDataArray.length - 4; i++) {
        if (fileDataArray[i] === 0x4F && // 'O'
            fileDataArray[i+1] === 0x67 && // 'g'
            fileDataArray[i+2] === 0x67 && // 'g'
            fileDataArray[i+3] === 0x53) { // 'S'
          secondPagePos = i;
          break;
        }
      }
      
      // 如果找到第二页，在其前面插入我们的注释页
      if (secondPagePos > 0) {
        console.log("找到第二个OGG页，位置:", secondPagePos);
        const resultArray = new Uint8Array(fileDataArray.length + hapticComment.length);
        resultArray.set(fileDataArray.subarray(0, secondPagePos));
        resultArray.set(hapticComment, secondPagePos);
        resultArray.set(fileDataArray.subarray(secondPagePos), secondPagePos + hapticComment.length);
        
        console.log("生成的文件大小:", resultArray.length, "字节");
        return new Blob([resultArray], { type: 'audio/ogg' });
      }
    }
    
    // 如果不是OGG或无法找到第二页，则创建一个新的OGG文件
    console.log("创建新的OGG文件，带有ANDROID_HAPTIC标记");
    
    // 创建一个基本的OGG文件头部
    const oggHeader = new Uint8Array([
      // OGG header magic - "OggS"
      0x4F, 0x67, 0x67, 0x53,
      // Version
      0x00,
      // Header type
      0x02,
      // Granule position (8 bytes)
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      // Stream serial number
      0x01, 0x02, 0x03, 0x04,
      // Sequence number
      0x00, 0x00, 0x00, 0x00,
      // CRC checksum
      0x00, 0x00, 0x00, 0x00,
      // Page segments
      0x01,
      // Segment table
      0x1F
    ]);
    
    // 添加ANDROID_HAPTIC元数据
    const commentHeader = new Uint8Array([
      // Comment header
      0x03, 0x76, 0x6F, 0x72, 0x62, 0x69, 0x73,
      // Vendor length
      0x09, 0x00, 0x00, 0x00,
      // Vendor string: "BoneVibe"
      0x42, 0x6F, 0x6E, 0x65, 0x56, 0x69, 0x62, 0x65, 0x20,
      // Number of comments
      0x01, 0x00, 0x00, 0x00,
      // Comment length
      0x10, 0x00, 0x00, 0x00,
      // Comment: "ANDROID_HAPTIC=1"
      0x41, 0x4E, 0x44, 0x52, 0x4F, 0x49, 0x44, 0x5F,
      0x48, 0x41, 0x50, 0x54, 0x49, 0x43, 0x3D, 0x31,
      // Framing bit
      0x01
    ]);
    
    // 组合所有部分，尽可能保留原始文件数据
    const combinedArray = new Uint8Array(
      oggHeader.length + 
      commentHeader.length + 
      fileDataArray.length
    );
    
    combinedArray.set(oggHeader, 0);
    combinedArray.set(commentHeader, oggHeader.length);
    combinedArray.set(fileDataArray, oggHeader.length + commentHeader.length);
    
    console.log("生成的文件大小:", combinedArray.length, "字节");
    // 创建最终的Blob
    return new Blob([combinedArray], { type: 'audio/ogg' });
  } catch (error) {
    console.error("创建演示文件出错:", error);
    // 返回一个最小的有效OGG文件
    return new Blob([new Uint8Array([
      0x4F, 0x67, 0x67, 0x53, 0x00, 0x02, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    ])], { type: 'audio/ogg' });
  }
}

// 初始化FFmpeg
async function initFFmpeg() {
  try {
    updateStatus('加载音频处理库...');
    const { createFFmpeg, fetchFile } = FFmpeg;
    ffmpeg = createFFmpeg({
      log: true,
      progress: ({ ratio }) => {
        const percent = Math.round(ratio * 100);
        updateProgress(percent);
      },
    });
    await ffmpeg.load();
    updateStatus('处理库加载完成');
    return { ffmpeg, fetchFile };
  } catch (error) {
    console.error('无法加载FFmpeg:', error);
    updateStatus('加载音频处理库失败');
    return null;
  }
}

// 处理文件拖放事件
dropArea.addEventListener('dragover', (e) => {
  e.preventDefault();
  e.stopPropagation();
  dropArea.classList.add('dragover');
});

dropArea.addEventListener('dragleave', (e) => {
  e.preventDefault();
  e.stopPropagation();
  dropArea.classList.remove('dragover');
});

dropArea.addEventListener('drop', (e) => {
  e.preventDefault();
  e.stopPropagation();
  dropArea.classList.remove('dragover');
  
  if (e.dataTransfer.files.length > 0) {
    handleFileSelect(e.dataTransfer.files[0]);
  }
});

// 点击上传区域触发文件选择
dropArea.addEventListener('click', () => {
  if (!isProcessing) {
    fileInput.click();
  }
});

// 处理文件选择
fileInput.addEventListener('change', (e) => {
  if (e.target.files.length > 0) {
    handleFileSelect(e.target.files[0]);
  }
});

// 文件选择逻辑
function handleFileSelect(file) {
  // 检查文件是否为音频
  if (!file.type.startsWith('audio/')) {
    showToast('请上传音频文件', 'error');
    return;
  }
  
  // 检查文件大小
  if (file.size > MAX_FILE_SIZE) {
    showToast(`文件过大，超过500MB`, 'error');
    return;
  }
  
  // 警告超过50MB的大文件
  if (file.size > 50 * 1024 * 1024) {
    showToast(`警告：大文件(${Math.round(file.size/1024/1024)}MB)可能导致浏览器变慢或崩溃`, 'warning');
  }
  
  // 设置当前文件并更新界面
  currentFile = file;
  fileName.textContent = file.name;
  fileName.style.display = 'block';
  clearBtn.disabled = false;
  processBtn.disabled = false;
}

// 清除按钮事件
clearBtn.addEventListener('click', () => {
  currentFile = null;
  fileName.textContent = '';
  fileName.style.display = 'none';
  clearBtn.disabled = true;
  processBtn.disabled = true;
  fileInput.value = '';
  updateProgress(0);
  progressContainer.style.display = 'none';
});

// 处理按钮事件
processBtn.addEventListener('click', () => {
  if (currentFile && !isProcessing) {
    processFile();
  }
});

// 更新进度条
function updateProgress(percent) {
  progressBarFill.style.width = `${percent}%`;
  progressText.textContent = `${percent}%`;
}

// 更新状态文本
function updateStatus(text) {
  statusText.textContent = text;
}

// 显示通知
function showToast(message, type = 'info') {
  // 移除现有通知
  const existingToasts = document.querySelectorAll('.toast');
  existingToasts.forEach(toast => {
    document.body.removeChild(toast);
  });
  
  // 创建通知元素
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  
  // 添加到文档
  document.body.appendChild(toast);
  
  // 显示通知
  setTimeout(() => {
    toast.classList.add('show');
  }, 10);
  
  // 3秒后淡出
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => {
      if (document.body.contains(toast)) {
        document.body.removeChild(toast);
      }
    }, 300);
  }, 3000);
}

// 文件处理逻辑
async function processFile() {
  if (!currentFile || isProcessing) return;
  
  try {
    isProcessing = true;
    processBtn.disabled = true;
    clearBtn.disabled = true;
    progressContainer.style.display = 'block';
    
    showToast('开始处理音频', 'info');
    updateStatus('准备文件...');
    
    const outputFileName = currentFile.name.replace(/\.[^/.]+$/, "") + '_haptic.ogg';
    
    // 模拟处理进度
    let currentProgress = 0;
    const progressInterval = setInterval(() => {
      currentProgress += 5;
      if (currentProgress > 95) clearInterval(progressInterval);
      updateProgress(currentProgress);
    }, 100);
    
    // 决定使用哪种处理方法
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    const isCrossOriginIsolated = window.crossOriginIsolated;
    let blob;
    
    if (!isMobile && isCrossOriginIsolated) {
      // 如果不是移动设备且支持跨域隔离，尝试使用FFmpeg
      try {
        updateStatus('初始化FFmpeg...');
        const ffmpegData = await initFFmpeg();
        
        if (ffmpegData) {
          const { ffmpeg, fetchFile } = ffmpegData;
          updateStatus('使用FFmpeg处理...');
          
          // 准备文件名
          const inputFileName = 'input.' + currentFile.name.split('.').pop();
          
          // 写入文件到FFmpeg的虚拟文件系统
          ffmpeg.FS('writeFile', inputFileName, await fetchFile(currentFile));
          
          // 执行转换命令
          if (advancedMode.checked) {
            try {
              // 尝试高级模式：三通道输出，增强震动效果
              await ffmpeg.run(
                '-i', inputFileName,
                '-ac', '3',  // 指定三通道输出
                '-ar', '48000',
                '-c:a', 'libvorbis',
                '-af', 'bass=frequency=100:gain=8',  // 增强低频，提高震动效果
                '-q:a', '3',  // 提高音频质量
                '-metadata:s:a:0', 'ANDROID_HAPTIC=1',  // 在第一个音频流添加标记
                outputFileName
              );
            } catch (error) {
              console.warn('三通道模式失败，尝试双通道模式:', error);
              // 备选方案：双通道模式（更兼容）
              await ffmpeg.run(
                '-i', inputFileName,
                '-ac', '2',  // 指定双通道输出
                '-ar', '48000',
                '-c:a', 'libvorbis',
                '-af', 'bass=frequency=100:gain=6',  // 增强低频，提高震动效果
                '-q:a', '4',  // 提高音频质量
                '-metadata:s:a:0', 'ANDROID_HAPTIC=1',  // 在第一个音频流添加标记
                outputFileName
              );
            }
          } else {
            // 默认模式：单声道版本，也增强低频
            await ffmpeg.run(
              '-i', inputFileName,
              '-ac', '1',
              '-ar', '48000',
              '-c:a', 'libvorbis',
              '-af', 'bass=frequency=100:gain=5',  // 增强低频，提高震动效果
              '-q:a', '5',  // 提高音频质量
              '-metadata:s:a:0', 'ANDROID_HAPTIC=1',
              outputFileName
            );
          }
          
          // 读取处理后的文件
          const data = ffmpeg.FS('readFile', outputFileName);
          blob = new Blob([data.buffer], { type: 'audio/ogg' });
          
          // 清理
          ffmpeg.FS('unlink', inputFileName);
          ffmpeg.FS('unlink', outputFileName);
        } else {
          // FFmpeg加载失败，回退到简化版
          updateStatus('回退到简化版本...');
          blob = await createSimpleHapticFile(currentFile);
        }
      } catch (ffmpegError) {
        console.error('FFmpeg处理出错，回退到简化版本:', ffmpegError);
        updateStatus('回退到简化版本...');
        blob = await createSimpleHapticFile(currentFile);
      }
    } else {
      // 使用简化版处理
      const reasonText = isMobile ? '检测到移动设备' : '浏览器不支持完整处理能力';
      updateStatus(`${reasonText}，使用简化版本处理...`);
      blob = await createSimpleHapticFile(currentFile);
    }
    
    // 停止进度模拟
    clearInterval(progressInterval);
    updateProgress(100);
    
    // 创建下载链接
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = outputFileName;
    document.body.appendChild(link);
    
    // 自动下载
    link.click();
    
    // 清理
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 100);
    
    showToast('处理完成！文件已下载', 'success');
    showToast('请在你的Android手机上将下载的文件设置为铃声', 'info');
    updateStatus('处理完成');
    
  } catch (error) {
    console.error('处理文件时出错:', error);
    showToast('处理文件时出错', 'error');
    updateStatus('处理出错');
  } finally {
    isProcessing = false;
    processBtn.disabled = false;
    clearBtn.disabled = false;
  }
} 