let ioRef = null;

function setIO(io) { ioRef = io; }
function getIO() { return ioRef; }

function emit(event, payload) {
  if (ioRef) ioRef.emit(event, payload);
}

function emitToRoom(room, event, payload) {
  if (ioRef) ioRef.to(room).emit(event, payload);
}

module.exports = { setIO, getIO, emit, emitToRoom };
