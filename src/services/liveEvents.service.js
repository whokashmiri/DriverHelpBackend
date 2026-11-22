//services/liveEvents.service.js

/*
 * Real-time events for supervisor screens.
 *
 * Supervisors join the room `supervisor:<id>`
 * (see sockets/index.js). Drivers join `user:<id>`.
 *
 * Events:
 * - driver:shift:update  { driverId, isWorking, shiftId, startedAt, endedAt }
 * - driver:order:update  { driverId, orderId, status }
 * - driver:location:request (to driver) { reason }
 */

let ioInstance = null;

export function setLiveEventsIo(io) {
  ioInstance = io;
}

export function getLiveEventsIo() {
  return ioInstance;
}

function emitToSupervisor(supervisorId, event, payload) {
  if (!ioInstance || !supervisorId) {
    return;
  }

  ioInstance
    .to(`supervisor:${String(supervisorId)}`)
    .emit(event, payload);
}

export function emitShiftUpdate(shift) {
  if (!shift) {
    return;
  }

  emitToSupervisor(shift.supervisor, "driver:shift:update", {
    driverId: String(shift.driver),
    shiftId: String(shift._id),
    isWorking: shift.status === "active",
    startedAt: shift.startedAt ?? null,
    endedAt: shift.endedAt ?? null,
  });
}

export function emitOrderUpdate(order) {
  if (!order) {
    return;
  }

  const riderId =
    typeof order.rider === "object" && order.rider?._id
      ? order.rider._id
      : order.rider;

  emitToSupervisor(order.supervisor, "driver:order:update", {
    driverId: String(riderId),
    orderId: String(order._id),
    status: order.status,
  });
}

/*
 * Ask a connected driver app to send a GPS fix now.
 * Returns true if the driver has a live socket.
 */
export async function requestDriverLocation(driverId, reason = "stale") {
  if (!ioInstance || !driverId) {
    return false;
  }

  const room = `user:${String(driverId)}`;

  const sockets = await ioInstance.in(room).fetchSockets();

  if (sockets.length === 0) {
    return false;
  }

  ioInstance.to(room).emit("driver:location:request", { reason });

  return true;
}
