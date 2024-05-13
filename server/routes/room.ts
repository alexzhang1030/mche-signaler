import { Message, Peer } from "crossws";
import { withHandleMetaEvent } from "mche/server";

const map = new Map</* roomId */ string, Map</* userId */ string, Peer<any>>>();
const wsMap = new Map<
  /* ws id */ string,
  /* roomId */ {
    roomId: string;
    userId: string;
  }
>();

const {
  getHeartbeatResponse,
  isHeartbeatRequestParsed,
  getMetaCloseResponse,
  getMetaRegisterAcceptResponse,
  getMetaRegisterResponse,
  getMetaRegisterEventPayload,
  isMetaRegisterEvent,
  tryParseMetaEvent,
} = withHandleMetaEvent();

function broadcastToPeers(ws: Peer, message: Message) {
  if (!wsMap.has(ws.id)) return;
  const { roomId } = wsMap.get(ws.id);
  const room = map.get(roomId);
  room.forEach((peer) => {
    if (peer !== ws) {
      peer.send(message.isBinary ? message.rawData : message.text());
    }
  });
}

export default defineWebSocketHandler({
  message: (ws, message) => {
    if (message.isBinary) {
      broadcastToPeers(ws, message);
      return;
    }
    const [data, success] = tryParseMetaEvent(message.text());
    console.log({ data, success });
    if (!success) {
      broadcastToPeers(ws, message);
      return;
    }

    // handle heartbeat
    if (isHeartbeatRequestParsed(data)) {
      ws.send(getHeartbeatResponse());
      return;
    }

    // handle register
    if (isMetaRegisterEvent(data)) {
      const { roomId, userId } = getMetaRegisterEventPayload(data);
      const hasRoom = map.has(roomId);
      if (!hasRoom) {
        map.set(roomId, new Map());
      }
      const room = map.get(roomId);
      room.forEach((peer) => {
        // send to all peers in the room
        peer.send(getMetaRegisterResponse(roomId, userId));
      });
      wsMap.set(ws.id, {
        roomId,
        userId,
      });
      ws.send(getMetaRegisterAcceptResponse(roomId, userId));
      room.set(ws.id, ws);
      return;
    }
  },
  close: (ws) => {
    const { roomId, userId } = wsMap.get(ws.id);
    const room = map.get(roomId);
    room.delete(ws.id);
    wsMap.delete(ws.id);
    room.forEach((peer) => {
      peer.send(getMetaCloseResponse(roomId, userId));
    });
  },
});
