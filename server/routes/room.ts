import { Message, Peer } from "crossws";
import { destr } from "destr";

const map = new Map</* roomId */ string, Map</* userId */ string, Peer<any>>>();
const wsMap = new Map</* ws id */ string, /* roomId */ string>();

enum EventType {
  OPEN = "open",
  CLOSE = "close",

  PING = "ping",
  PONG = "pong",

  REGISTER = "register",
}

interface EventPayload {
  event: EventType;
  data: any;
}

function getPayload(message: Message) {
  return destr<EventPayload>(message.text());
}

function buildMessage(event: EventType, data: any) {
  return JSON.stringify({
    event,
    data,
  });
}

export default defineWebSocketHandler({
  message: (ws, message) => {
    const payload = getPayload(message);
    if (payload.event === EventType.PING) {
      ws.send(buildMessage(EventType.PONG, "pong"));
      return;
    }
    if (payload.event === EventType.REGISTER) {
      // payload.data: { roomId: string, userId: string }
      const { roomId, userId } = JSON.parse(payload.data);
      const hasRoom = map.has(roomId);
      if (!hasRoom) {
        map.set(roomId, new Map());
      }
      const room = map.get(roomId);
      room.forEach((peer) => {
        // send to all peers in the room
        peer.send(
          buildMessage(EventType.OPEN, {
            roomId: roomId,
            data: [{ id: userId }],
          })
        );
      });
      wsMap.set(ws.id, roomId);
      room.set(ws.id, ws);
      return;
    }
    const room = map.get(wsMap.get(ws.id));
    room.forEach((peer) => {
      if (peer !== ws) {
        peer.send(message.text());
      }
    });
  },
  close: (ws) => {
    const roomId = wsMap.get(ws.id);
    const room = map.get(roomId);
    room.delete(ws.id);
    room.forEach((peer) => {
      peer.send(
        buildMessage(EventType.CLOSE, {
          roomId,
          data: {
            id: ws.id,
          },
        })
      );
    });
  },
});
