class WebSocketService {
  static instance = null;
  
  constructor(url) {
    if (WebSocketService.instance) {
      return WebSocketService.instance;
    }
    
    this.url = url;
    this.ws = null;
    this.listeners = {};
    this.reconnectInterval = 5000;
    this.shouldReconnect = true;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;
    
    this.connect();
    WebSocketService.instance = this;
  }
  
  static getInstance() {
    return WebSocketService.instance;
  }
  
  connect() {
    try {
      console.log('Attempting WebSocket connection to:', this.url);
      this.ws = new WebSocket(this.url);
      
      this.ws.onopen = () => {
        console.log('WebSocket connected');
        this.reconnectAttempts = 0;
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
      
      this.ws.onclose = (event) => {
        console.log('WebSocket disconnected:', event.code, event.reason);
        if (this.shouldReconnect && this.reconnectAttempts < this.maxReconnectAttempts) {
          this.reconnectAttempts++;
          console.log(`Reconnecting... (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
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
    console.log(`Listener added for event: ${event}`);
  }
  
  off(event, callback) {
    if (!this.listeners[event]) return;
    this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
  }
  
  emit(event, data) {
    if (!this.listeners[event]) {
      console.log(`No listeners for event: ${event}`);
      return;
    }
    console.log(`Emitting event: ${event} to ${this.listeners[event].length} listeners`);
    this.listeners[event].forEach(callback => {
      try {
        callback(data);
      } catch (error) {
        console.error(`Error in event listener for ${event}:`, error);
      }
    });
  }
  
  send(data) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      console.log('Sending WebSocket message:', data);
      this.ws.send(JSON.stringify(data));
    } else {
      console.error('WebSocket is not connected. ReadyState:', this.ws?.readyState);
      // 再接続を試みる
      if (this.shouldReconnect && this.reconnectAttempts < this.maxReconnectAttempts) {
        this.connect();
      }
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
