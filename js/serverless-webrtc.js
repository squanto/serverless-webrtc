/* See also:
    http://www.html5rocks.com/en/tutorials/webrtc/basics/
    https://code.google.com/p/webrtc-samples/source/browse/trunk/apprtc/index.html

    https://webrtc-demos.appspot.com/html/pc1.html
*/

document.addEventListener("DOMContentLoaded", function () {
  console.log("Dom content loaded")

  // which data connection is active
  window.activedc = null

  // config
  const navigatorOptions = { video: true, audio: true }
  const cfg = {
    'iceServers': [
      { 'url': 'stun:23.21.150.121' }
    ]
  }
  const con = {
    'optional': [
      { 'DtlsSrtpKeyAgreement': true }
    ]
  }

  /* THIS IS ALICE, THE CALLER/SENDER */
  var pc1 = new RTCPeerConnection(cfg, con)
  var dc1 = null

  const sdpConstraints = {
    optional: [],
    mandatory: {
      OfferToReceiveAudio: true,
      OfferToReceiveVideo: true
    }
  }

  // Max call size problem
  $.fn.modal.Constructor.prototype.enforceFocus = function () { };

  $('#showLocalOffer').modal('hide')
  $('#getRemoteAnswer').modal('hide')
  $('#waitForConnection').modal('hide')
  $('#createOrJoin').modal('show')

  document.getElementById('createBtn').addEventListener('click', () => {
    console.log("createBtn clicked")
    $('#showLocalOffer').modal('show')
    createLocalOffer()
  })

  document.getElementById('joinBtn').addEventListener('click', () => {
    navigator.getUserMedia = navigator.getUserMedia ||
      navigator.webkitGetUserMedia ||
      navigator.mozGetUserMedia ||
      navigator.msGetUserMedia
    navigator.getUserMedia(navigatorOptions, function (stream) {
      var video = document.getElementById('localVideo')
      video.srcObject = stream
      video.play()
      pc2.addStream(stream)
    }, function (error) {
      console.log('Error adding stream to pc2: ' + error)
    })
    $('#getRemoteOffer').modal('show')
  })

  document.getElementById('offerSentBtn').addEventListener('click', () => {
    $('#getRemoteAnswer').modal('show')
  })

  document.getElementById('offerRecdBtn').addEventListener('click', () => {
    var offer = $('#remoteOffer').val()
    var offerDesc = new RTCSessionDescription(JSON.parse(offer))
    console.log('Received remote offer', offerDesc)
    writeToChatLog('Received remote offer', 'text-success')
    handleOfferFromPC1(offerDesc)
    $('#showLocalAnswer').modal('show')
  })

  document.getElementById('answerSentBtn').addEventListener('click', () => {
    $('#waitForConnection').modal('show')
  })

  document.getElementById('answerRecdBtn').addEventListener('click', () => {
    var answer = $('#remoteAnswer').val()
    var answerDesc = new RTCSessionDescription(JSON.parse(answer))
    handleAnswerFromPC2(answerDesc)
    $('#waitForConnection').modal('show')
  })

  $('#fileBtn').change(function () {
    const file = this.files[0]
    console.log(file)

    if (file.size) {
      FileSender.send({
        file,
        onFileSent: (file) => console.log(file + ' sent'),
        onFileProgress: (file) => console.log(file + ' progress')
      })
    }
  })

  function setupDC1() {
    try {
      var fileReceiver1 = new FileReceiver()
      dc1 = pc1.createDataChannel('test', { reliable: true })
      console.log("using dc1", dc1)
      window.activedc = dc1
      console.log('Created datachannel (pc1)')
      dc1.onopen = function (e) {
        console.log('data channel connect')
        $('#waitForConnection').modal('hide')
        $('#waitForConnection').remove()
      }
      dc1.onmessage = function (e) {
        console.log('Got message (pc1)', e.data)
        if (e.data.size) {
          fileReceiver1.receive(e.data, {})
        } else {
          if (e.data.charCodeAt(0) == 2) {
            // The first message we get from Firefox (but not Chrome)
            // is literal ASCII 2 and I don't understand why -- if we
            // leave it in, JSON.parse() will barf.
            return
          }
          console.log(e)
          var data = JSON.parse(e.data)
          if (data.type === 'file') {
            fileReceiver1.receive(e.data, {})
          } else {
            writeToChatLog(data.message, 'text-info')
            // Scroll chat text area to the bottom on new input.
            $('#chatlog').scrollTop($('#chatlog')[0].scrollHeight)
          }
        }
      }
    } catch (e) { console.warn('No data channel (pc1)', e); }
  }

  function createLocalOffer() {
    function errorHandler(msg) {
      return function(error) {
        console.error(msg, error)
      }
    }
    console.log('createLocalOffer')
    navigator.getUserMedia = navigator.getUserMedia ||
      navigator.webkitGetUserMedia ||
      navigator.mozGetUserMedia ||
      navigator.msGetUserMedia

    function withStream(stream) {
      console.log("getUserMedia got response stream")
      var video = document.getElementById('localVideo')
      console.log("stream: ", stream, typeof stream)
      video.srcObject = stream
      video.play()
      pc1.addStream(stream)
      console.log(stream)
      console.log('adding stream to pc1')
      setupDC1()
      pc1.createOffer(
        function (desc) {
          pc1.setLocalDescription(desc,
            () => { console.log("setLocalDescription success") },
            errorHandler("setLocalDescription error"))
          console.log('created local offer', desc)
        },
        errorHandler("Couldn't create offer"),
        sdpConstraints
      )
    }
    function onStreamError(error) {
      console.log('Error adding stream to pc1: ' + error)
    }
    navigator.getUserMedia(navigatorOptions, withStream, onStreamError)
  }

  pc1.onicecandidate = function (e) {
    console.log('ICE candidate (pc1)', e)
    $('#localOffer').html("Generating...")
    if (e.candidate == null) {
      $('#localOffer').html(JSON.stringify(pc1.localDescription))
    }
  }

  function handleOnaddstream(e) {
    console.log('Got remote stream', e.stream)
    var el = document.getElementById('remoteVideo')
    el.autoplay = true
    attachMediaStream(el, e.stream)
  }

  pc1.onaddstream = handleOnaddstream

  function handleOnconnection() {
    console.log('Datachannel connected')
    writeToChatLog('Datachannel connected', 'text-success')
    $('#waitForConnection').modal('hide')
    // If we didn't call remove() here, there would be a race on pc2:
    //   - first onconnection() hides the dialog, then someone clicks
    //     on answerSentBtn which shows it, and it stays shown forever.
    $('#waitForConnection').remove()
    $('#showLocalAnswer').modal('hide')
    $('#messageTextBox').focus()
  }

  pc1.onconnection = handleOnconnection

  function onsignalingstatechange(state) {
    console.info('signaling state change:', state)
  }

  function oniceconnectionstatechange(state) {
    console.info('ice connection state change:', state)
  }

  function onicegatheringstatechange(state) {
    console.info('ice gathering state change:', state)
  }

  pc1.onsignalingstatechange = onsignalingstatechange
  pc1.oniceconnectionstatechange = oniceconnectionstatechange
  pc1.onicegatheringstatechange = onicegatheringstatechange

  function handleAnswerFromPC2(answerDesc) {
    console.log('Received remote answer: ', answerDesc)
    writeToChatLog('Received remote answer', 'text-success')
    pc1.setRemoteDescription(answerDesc)
  }

  function handleCandidateFromPC2(iceCandidate) {
    pc1.addIceCandidate(iceCandidate)
  }

  /* THIS IS BOB, THE ANSWERER/RECEIVER */
  var pc2 = new RTCPeerConnection(cfg, con)
  var dc2 = null

  pc2.ondatachannel = function (e) {
    var fileReceiver2 = new FileReceiver()
    var datachannel = e.channel || e; // Chrome sends event, FF sends raw channel
    console.log('Received datachannel (pc2)', arguments)
    dc2 = datachannel
    window.activedc = dc2
    console.log("using dc2", dc2)
    dc2.onopen = function (e) {
      console.log('data channel connect')
      $('#waitForConnection').modal('hide')
      $('#waitForConnection').remove()
    }
    dc2.onmessage = function (e) {
      console.log('Got message (pc2)', e.data)
      if (e.data.size) {
        fileReceiver2.receive(e.data, {})
      } else {
        var data = JSON.parse(e.data)
        if (data.type === 'file') {
          fileReceiver2.receive(e.data, {})
        } else {
          writeToChatLog(data.message, 'text-info')
          // Scroll chat text area to the bottom on new input.
          $('#chatlog').scrollTop($('#chatlog')[0].scrollHeight)
        }
      }
    }
  }

  function handleOfferFromPC1(offerDesc) {
    pc2.setRemoteDescription(offerDesc)
    pc2.createAnswer(function (answerDesc) {
      writeToChatLog('Created local answer', 'text-success')
      console.log('Created local answer: ', answerDesc)
      pc2.setLocalDescription(answerDesc)
    },
      function () { console.warn("Couldn't create offer") },
      sdpConstraints)
  }

  pc2.onicecandidate = function (e) {
    console.log('ICE candidate (pc2)', e)
    // TODO: generating handshake. Lock ui + set progress
    $('#localAnswer').html("Generating...")
    if (e.candidate == null) {
      // TODO: unlock ui etc etc.
      $('#localAnswer').html(JSON.stringify(pc2.localDescription))
    }
  }

  pc2.onsignalingstatechange = onsignalingstatechange
  pc2.oniceconnectionstatechange = oniceconnectionstatechange
  pc2.onicegatheringstatechange = onicegatheringstatechange

  function handleCandidateFromPC1(iceCandidate) {
    pc2.addIceCandidate(iceCandidate)
  }

  pc2.onaddstream = handleOnaddstream
  pc2.onconnection = handleOnconnection

  function getTimestamp() {
    var totalSec = new Date().getTime() / 1000
    var hours = parseInt(totalSec / 3600) % 24
    var minutes = parseInt(totalSec / 60) % 60
    var seconds = parseInt(totalSec % 60)

    var result = (hours < 10 ? '0' + hours : hours) + ':' +
      (minutes < 10 ? '0' + minutes : minutes) + ':' +
      (seconds < 10 ? '0' + seconds : seconds)

    return result
  }

  function writeToChatLog(message, message_type) {
    let chatLog = document.getElementById('chatlog')
    const newMessageHTML = '<p class="' + message_type + '">' + '[' + getTimestamp() + '] ' + message + '</p>'
    chatLog.innerHTML += newMessageHTML
  }

  // used to send chat messages
  $('#sendMessageForm').submit(function sendMessage(event) {
    event.preventDefault() // TODO: Do you need to also return false? redundant
    if ($('#messageTextBox').val()) {
      var channel = new RTCMultiSession()
      writeToChatLog($('#messageTextBox').val(), 'text-success')
      channel.send({ message: $('#messageTextBox').val() })
      $('#messageTextBox').val('')

      // Scroll chat text area to the bottom on new input.
      $('#chatlog').scrollTop($('#chatlog')[0].scrollHeight)
    }

    return false
  })
})
