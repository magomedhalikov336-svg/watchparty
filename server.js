const express = require('express')
const http = require('http')
const { Server } = require('socket.io')
const path = require('path')
const crypto = require('crypto')

const app = express()
const server = http.createServer(app)
const io = new Server(server)

app.use(express.static(path.join(__dirname, 'public')))

// In-memory rooms
// { [roomId]: { hostId, isPlaying, currentTime, lastUpdatedAt, videoUrl, members: Map<socketId, {username}> } }
const rooms = new Map()

function getOrCreateRoom(roomId) {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, {
      hostId: null,
      isPlaying: false,
      currentTime: 0,
      lastUpdatedAt: Date.now(),
      videoUrl: null,
      members: new Map()
    })
  }
  return rooms.get(roomId)
}

function getComputedTime(room) {
  if (!room.isPlaying) return room.currentTime
  return room.currentTime + (Date.now() - room.lastUpdatedAt) / 1000
}

function getRoomMembers(room) {
  return Array.from(room.members.values())
}

// Heartbeat: every 5s sync all rooms
setInterval(() => {
  for (const [roomId, room] of rooms) {
    if (room.members.size === 0) continue
    io.to(roomId).emit('sync', {
      currentTime: getComputedTime(room),
      isPlaying: room.isPlaying,
      serverTime: Date.now(),
      videoUrl: room.videoUrl
    })
  }
}, 5000)

io.on('connection', (socket) => {

  socket.on('join', ({ roomId, username }) => {
    if (!roomId || !username) return

    const room = getOrCreateRoom(roomId)
    const isFirst = room.members.size === 0

    room.members.set(socket.id, { username })
    socket.join(roomId)
    socket.data = { roomId, username }

    // First person becomes host
    if (isFirst) room.hostId = socket.id

    // Send current state to new joiner
    socket.emit('room-state', {
      hostId: room.hostId,
      members: getRoomMembers(room),
      sync: {
        currentTime: getComputedTime(room),
        isPlaying: room.isPlaying,
        serverTime: Date.now(),
        videoUrl: room.videoUrl
      }
    })

    // Notify others
    socket.to(roomId).emit('user-joined', { username })
    io.to(roomId).emit('members', getRoomMembers(room))
    io.to(roomId).emit('host', { hostId: room.hostId })
  })

  socket.on('set-video', ({ videoUrl }) => {
    const { roomId } = socket.data || {}
    if (!roomId) return
    const room = rooms.get(roomId)
    if (!room || room.hostId !== socket.id) return

    room.videoUrl = videoUrl
    room.currentTime = 0
    room.isPlaying = false
    room.lastUpdatedAt = Date.now()
    io.to(roomId).emit('video-changed', { videoUrl })
  })

  socket.on('play', ({ currentTime }) => {
    const { roomId } = socket.data || {}
    if (!roomId) return
    const room = rooms.get(roomId)
    if (!room || room.hostId !== socket.id) return

    room.isPlaying = true
    room.currentTime = currentTime
    room.lastUpdatedAt = Date.now()
    socket.to(roomId).emit('play', { currentTime, serverTime: Date.now() })
  })

  socket.on('pause', ({ currentTime }) => {
    const { roomId } = socket.data || {}
    if (!roomId) return
    const room = rooms.get(roomId)
    if (!room || room.hostId !== socket.id) return

    room.isPlaying = false
    room.currentTime = currentTime
    room.lastUpdatedAt = Date.now()
    socket.to(roomId).emit('pause', { currentTime })
  })

  socket.on('seek', ({ currentTime }) => {
    const { roomId } = socket.data || {}
    if (!roomId) return
    const room = rooms.get(roomId)
    if (!room || room.hostId !== socket.id) return

    room.currentTime = currentTime
    room.lastUpdatedAt = Date.now()
    socket.to(roomId).emit('seek', { currentTime, serverTime: Date.now() })
  })

  socket.on('chat', ({ text }) => {
    const { roomId, username } = socket.data || {}
    if (!roomId || !text || !text.trim()) return
    const safe = text.trim().slice(0, 500).replace(/</g, '&lt;').replace(/>/g, '&gt;')
    io.to(roomId).emit('chat', { username, text: safe, time: Date.now() })
  })

  socket.on('countdown', () => {
    const { roomId } = socket.data || {}
    if (!roomId) return
    const room = rooms.get(roomId)
    if (!room || room.hostId !== socket.id) return
    socket.to(roomId).emit('countdown')
  })

  socket.on('disconnect', () => {
    const { roomId, username } = socket.data || {}
    if (!roomId) return

    const room = rooms.get(roomId)
    if (!room) return

    room.members.delete(socket.id)

    if (room.members.size === 0) {
      rooms.delete(roomId)
      return
    }

    // Assign new host if host left
    if (room.hostId === socket.id) {
      room.hostId = room.members.keys().next().value
      io.to(roomId).emit('host', { hostId: room.hostId })
    }

    io.to(roomId).emit('members', getRoomMembers(room))
    io.to(roomId).emit('user-left', { username })
  })
})

const PORT = process.env.PORT || 3000
server.listen(PORT, () => {
  console.log('')
  console.log('  WatchParty запущен!')
  console.log(`  Открой браузер: http://localhost:${PORT}`)
  console.log('')
})
