class WebSocketService {
  static instance = null;
  
  constructor(url) {
    // 既存のインスタンスがある場合は新しく作成しない
    if (WebSocketService.instance && WebSocketService.instance.ws && 
        WebSocketService.instance.ws.readyState === WebSocket.OPEN) {
      return WebSocketService.instance;
    }
    
    this.url = url;
    this.ws = null;
    this.listeners = {};
    this.reconnectInterval = 5000;
    this.shouldReconnect = true;
    this.messageQueue = []; // 接続前のメッセージを保持
    
    this.connect();
    WebSocketService.instance = this;
  }
  
  static getInstance() {
    if (!WebSocketService.instance) {
      console.error('WebSocketService not initialized');
      return null;
    }
    return WebSocketService.instance;
  }
  
  connect() {
    try {
      console.log('Connecting to WebSocket:', this.url);
      this.ws = new WebSocket(this.url);
      
      this.ws.onopen = () => {
        console.log('WebSocket connected');
        // キューに溜まったメッセージを送信
        while (this.messageQueue.length > 0) {
          const message = this.messageQueue.shift();
          this.send(message);
        }
      };
      
      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log('WebSocket message received:', data.type);
          this.emit(data.type, data.data);
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error);
        }
      };
      
      this.ws.onclose = () => {
        console.log('WebSocket disconnected');
        if (this.shouldReconnect) {
          setTimeout(() => this.connect(), this.reconnectInterval);
        }
      };
      
      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error);
      };
    } catch (error) {
      console.error('Failed to create WebSocket connection:', error);
    }
  }
  
  on(event, callback) {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(callback);
  }
  
  off(event, callback) {
    if (!this.listeners[event]) return;
    this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
  }
  
  emit(event, data) {
    if (!this.listeners[event]) return;
    this.listeners[event].forEach(callback => {
      try {
        callback(data);
      } catch (error) {
        console.error(`Error in ${event} listener:`, error);
      }
    });
  }
  
  send(data) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      const message = JSON.stringify(data);
      console.log('Sending WebSocket message:', data.type);
      this.ws.send(message);
    } else {
      console.log('WebSocket not connected, queuing message');
      this.messageQueue.push(data);
    }
  }
  
  close() {
    this.shouldReconnect = false;
    if (this.ws) {
      this.ws.close();
    }
    WebSocketService.instance = null;
  }
}

export { WebSocketService };