const { app, BrowserWindow, ipcMain, Notification } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;

// 数据存储路径（保存任务记录与设置）
const userDataPath = app.getPath('userData');
const dataFile = path.join(userDataPath, 'pomodoro-data.json');

function loadData() {
  try {
    if (fs.existsSync(dataFile)) {
      return JSON.parse(fs.readFileSync(dataFile, 'utf-8'));
    }
  } catch (e) {
    console.error('加载数据失败:', e);
  }
  return { records: [], settings: null };
}

function saveData(data) {
  try {
    fs.writeFileSync(dataFile, JSON.stringify(data, null, 2), 'utf-8');
    return true;
  } catch (e) {
    console.error('保存数据失败:', e);
    return false;
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 420,
    height: 640,
    minWidth: 380,
    minHeight: 560,
    resizable: true,
    title: '番茄钟',
    backgroundColor: '#f5f1ec',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadFile('index.html');

  // mainWindow.webContents.openDevTools();
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// IPC: 数据读写
ipcMain.handle('load-data', () => loadData());
ipcMain.handle('save-data', (event, data) => saveData(data));

// IPC: 系统通知
ipcMain.handle('notify', (event, { title, body }) => {
  if (Notification.isSupported()) {
    new Notification({ title, body, silent: false }).show();
  }
});
