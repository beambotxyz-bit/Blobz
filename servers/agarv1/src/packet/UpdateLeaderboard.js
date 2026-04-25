function UpdateLeaderboard(leaderboard, packetLB, ctxt, options) {
  this.leaderboard = leaderboard;
  this.packetLB = packetLB;
  this.ctxt = ctxt;
  this.options = options || {};
}

module.exports = UpdateLeaderboard;

UpdateLeaderboard.prototype.build = function () {
  var lb = this.leaderboard;
  var bufferSize = 5;
  var validElements = 0;

  function writeString(view, offset, value) {
    var text = value || "";
    for (var i = 0; i < text.length; i++) {
      view.setUint16(offset, text.charCodeAt(i), true);
      offset += 2;
    }
    view.setUint16(offset, 0, true);
    return offset + 2;
  }

  function getEntryName(entry) {
    if (!entry) return "";
    if (typeof entry.getName === "function") return entry.getName() || "";
    return entry.name || "";
  }

  function getEntryScore(entry) {
    if (!entry) return 0;
    if (typeof entry.getScore === "function") return entry.getScore(false) || 0;
    return entry.score || 0;
  }

  function getEntryNodeId(entry) {
    if (!entry || !entry.cells || !entry.cells[0]) return 0;
    return entry.cells[0].nodeId || 0;
  }

  switch (this.packetLB) {
    case 48: // Custom Text List
      for (var i = 0; i < lb.length; i++) {
        if (typeof lb[i] == "undefined") continue;

        var item = lb[i];
        bufferSize += 4;
        bufferSize += item.length * 2;
        bufferSize += 2;
        validElements++;
      }

      var customBuf = new ArrayBuffer(bufferSize);
      var customView = new DataView(customBuf);
      customView.setUint8(0, 49, true);
      customView.setUint32(1, validElements, true);

      var customOffset = 5;
      for (var j = 0; j < lb.length; j++) {
        if (typeof lb[j] == "undefined") continue;
        customView.setUint32(customOffset, 0, true);
        customOffset += 4;
        customOffset = writeString(customView, customOffset, lb[j]);
      }
      return customBuf;

    case 49: { // FFA-type Packet (Personalized compact list)
      var topLimit = this.options.topLimit > 0 ? this.options.topLimit : 5;
      var allPlayers = Array.isArray(this.options.allPlayers) ? this.options.allPlayers : lb;
      var viewer = this.options.viewer || null;
      var topEntries = [];
      var selfEntry = null;
      var selfRank = 0;

      for (var topIndex = 0; topIndex < lb.length && topEntries.length < topLimit; topIndex++) {
        if (typeof lb[topIndex] == "undefined") continue;
        topEntries.push({
          entry: lb[topIndex],
          rank: topIndex + 1,
          score: getEntryScore(lb[topIndex]),
          name: getEntryName(lb[topIndex])
        });
      }

      if (viewer && allPlayers.length > 0) {
        for (var rankIndex = 0; rankIndex < allPlayers.length; rankIndex++) {
          var rankedPlayer = allPlayers[rankIndex];
          if (!rankedPlayer) continue;
          if (rankedPlayer === viewer || (viewer.pID && rankedPlayer.pID === viewer.pID)) {
            selfEntry = rankedPlayer;
            selfRank = rankIndex + 1;
            break;
          }
        }
      }

      validElements = topEntries.length;
      for (var sizeIndex = 0; sizeIndex < topEntries.length; sizeIndex++) {
        bufferSize += 4; // node id
        bufferSize += 2; // rank
        bufferSize += 4; // score
        bufferSize += topEntries[sizeIndex].name.length * 2;
        bufferSize += 2; // terminator
      }

      bufferSize += 1; // has self row
      if (selfEntry && selfRank > 0) {
        var selfName = getEntryName(selfEntry);
        bufferSize += 2; // self rank
        bufferSize += 4; // self score
        bufferSize += selfName.length * 2;
        bufferSize += 2; // terminator
      }

      var buf = new ArrayBuffer(bufferSize);
      var view = new DataView(buf);
      view.setUint8(0, this.packetLB, true);
      view.setUint32(1, validElements, true);

      var offset = 5;
      for (var writeIndex = 0; writeIndex < topEntries.length; writeIndex++) {
        var topItem = topEntries[writeIndex];
        view.setUint32(offset, getEntryNodeId(topItem.entry), true);
        offset += 4;
        view.setUint16(offset, topItem.rank, true);
        offset += 2;
        view.setUint32(offset, Math.max(0, Math.floor(topItem.score)), true);
        offset += 4;
        offset = writeString(view, offset, topItem.name);
      }

      if (selfEntry && selfRank > 0) {
        view.setUint8(offset, 1);
        offset += 1;
        view.setUint16(offset, selfRank, true);
        offset += 2;
        view.setUint32(offset, Math.max(0, Math.floor(getEntryScore(selfEntry))), true);
        offset += 4;
        offset = writeString(view, offset, getEntryName(selfEntry));
      } else {
        view.setUint8(offset, 0);
      }

      return buf;
    }

    case 50: // Teams-type Packet (Pie Chart)
      validElements = lb.length;
      bufferSize += validElements * 4;

      var teamBuf = new ArrayBuffer(bufferSize);
      var teamView = new DataView(teamBuf);

      teamView.setUint8(0, this.packetLB, true);
      teamView.setUint32(1, validElements, true);

      var teamOffset = 5;
      for (var teamIndex = 0; teamIndex < validElements; teamIndex++) {
        teamView.setFloat32(teamOffset, lb[teamIndex], true);
        teamOffset += 4;
      }

      return teamBuf;

    default:
      break;
  }
};
