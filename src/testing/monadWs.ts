import WebSocket from 'ws';

type SubHandle = { close: () => void };

type LogHandler = (log: any, phase: 'proposed' | 'finalized') => void;

export function subscribeLogs({
  wsUrl,
  address,
  onLog
}: {
  wsUrl: string;
  address: `0x${string}`;
  onLog: LogHandler;
}): SubHandle {
  let ws = new WebSocket(wsUrl);
  let subId: string | null = null;
  let usingMonadLogs = true;

  const send = (obj: any) => ws.readyState === ws.OPEN && ws.send(JSON.stringify(obj));

  ws.on('open', () => {
    console.log(`[WebSocket] Connected to ${wsUrl} for address ${address}`);
    // Try monadLogs first (lowest-latency). If it errors, we'll fallback to standard logs.
    send({
      id: 1,
      jsonrpc: '2.0',
      method: 'eth_subscribe',
      params: ['monadLogs', { address }]
    });
    console.log(`[WebSocket] Sent monadLogs subscription request for ${address}`);
  });

  ws.on('message', (data) => {
    const msg = JSON.parse(data.toString());

    // subscription established
    if (msg.id === 1 && msg.result) {
      subId = msg.result;
      console.log(`[WebSocket] monadLogs subscription established with ID: ${subId}`);
      return;
    }

    // monadLogs not supported? fallback to logs
    if (msg.error && usingMonadLogs) {
      console.log(`[WebSocket] monadLogs failed, falling back to standard logs:`, msg.error);
      usingMonadLogs = false;
      // try standard finalized logs
      send({
        id: 2,
        jsonrpc: '2.0',
        method: 'eth_subscribe',
        params: ['logs', { address }]
      });
      console.log(`[WebSocket] Sent standard logs subscription request for ${address}`);
      return;
    }

    // incoming event
    if (msg.method === 'eth_subscription' && msg.params?.subscription === subId) {
      const result = msg.params.result;
      console.log(`[WebSocket] Received event for ${address}:`, result);
      // monadLogs usually includes commit-stage info; if absent, treat as finalized
      const phase: 'proposed' | 'finalized' =
        result?.monadCommitState === 'Proposed' ? 'proposed' : 'finalized';
      onLog(result, phase);
    }
  });

  ws.on('close', () => {
    // auto-reconnect
    setTimeout(() => subscribeLogs({ wsUrl, address, onLog }), 200);
  });

  ws.on('error', (error) => {
    console.log(`[WebSocket] Connection error for ${address}:`, error.message);
    try { ws.close(); } catch {}
  });

  return {
    close: () => {
      try { ws.close(); } catch {}
    }
  };
}