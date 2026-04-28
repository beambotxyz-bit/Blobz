'use strict';
var Cell = require('./Cell');
var EjectedMass = require('../entity/EjectedMass');

function Virus() {
  Cell.apply(this, Array.prototype.slice.call(arguments));

  this.cellType = 2;
  this.spiked = 1;
  this.fed = 0;
  this.wobbly = 0; // wobbly effect
  this.isMotherCell = false; // Not to confuse bots
  this.par;
  this.baseVirusMass = this.mass;
  this.maxShots = null;
  this.shotsRemaining = null;
  this.isChildVirus = false;
  this.virusTier = 'normal';
}

module.exports = Virus;

Virus.prototype = new Cell();

Virus.prototype.ensureShotProfile = function (gameServer) {
  if (!gameServer) return;

  var normalMass = Math.max(10, Number(gameServer.config.virusStartMass) || 100);
  var miniMass = Math.max(10, Number(gameServer.config.virusMiniMass) || Math.round(normalMass * 0.67));

  if (!isFinite(this.baseVirusMass) || this.baseVirusMass <= 0) {
    this.baseVirusMass = this.mass > 0 ? this.mass : normalMass;
  }
  if (typeof this.isChildVirus !== 'boolean') {
    this.isChildVirus = false;
  }
  if (!this.virusTier) {
    this.virusTier = this.baseVirusMass <= miniMass ? 'mini' : 'normal';
  }

  var defaultShots = this.isChildVirus ?
    Math.max(0, Number(gameServer.config.virusChildShots) || 1) :
    Math.max(0, Number(gameServer.config.virusBaseShots) || 2);

  if (typeof this.maxShots !== 'number' || !isFinite(this.maxShots) || this.maxShots < 0) {
    this.maxShots = defaultShots;
  }
  if (typeof this.shotsRemaining !== 'number' || !isFinite(this.shotsRemaining) || this.shotsRemaining < 0) {
    this.shotsRemaining = this.maxShots;
  }

  this.mass = this.baseVirusMass;
};

Virus.prototype.setShotProfile = function (profile, gameServer) {
  profile = profile || {};

  if (isFinite(profile.baseVirusMass) && profile.baseVirusMass > 0) {
    this.baseVirusMass = profile.baseVirusMass;
    this.mass = profile.baseVirusMass;
  }
  if (typeof profile.isChildVirus === 'boolean') {
    this.isChildVirus = profile.isChildVirus;
  }
  if (typeof profile.virusTier === 'string' && profile.virusTier.length) {
    this.virusTier = profile.virusTier;
  }
  if (isFinite(profile.maxShots) && profile.maxShots >= 0) {
    this.maxShots = profile.maxShots;
  }
  if (isFinite(profile.shotsRemaining) && profile.shotsRemaining >= 0) {
    this.shotsRemaining = profile.shotsRemaining;
  }

  this.ensureShotProfile(gameServer);
  return this;
};


Virus.prototype.calcMove = null; // Only for player controlled movement

Virus.prototype.feed = function (feeder, gameServer) {
  this.ensureShotProfile(gameServer);
  if (this.moveEngineTicks == 0) this.setAngle(feeder.getAngle()); // Set direction if the virus explodes
  gameServer.removeNode(feeder);

  this.fed++;

  if (this.fed >= gameServer.config.virusFeedAmount && this.shotsRemaining > 0 && gameServer.getVirusNodes().length < gameServer.config.virusMaxAmount) {
    this.fed = 0;
    this.shotsRemaining--;
    gameServer.shootVirus(this);
  } else if (this.fed >= gameServer.config.virusFeedAmount) {
    this.fed = 0;
  }

  this.mass = this.baseVirusMass;
  return true;

};

// Main Functions

Virus.prototype.getEatingRange = function () {
  return this.getSize() / 3.14; // 0 for ejected cells
};
Virus.prototype.setpar = function (par) {
  this.par = par;

};
Virus.prototype.onConsume = function (consumer, gameServer) {
  var client = consumer.owner;
  if (client != this.par) {
    if (gameServer.troll[this.nodeId - 1] == 1) {

      client.setColor(0); // Set color
      for (var j in client.cells) {
        client.cells[j].setColor(0);
      }
      setTimeout(function () {

        client.name = "Got Trolled:EatMe";
        for (var j in client.cells) {
          client.cells[j].mass = 100;
          client.norecombine = true;
        }
      }, 1000);

      var donot = 1;
      gameServer.troll[this.nodeId] = 0;
    }

    if (gameServer.troll[this.nodeId - 1] == 2) {
      var len = client.cells.length;
      for (var j = 0; j < len; j++) {
        gameServer.removeNode(client.cells[0]);

      }
      var donot = 2;
      gameServer.troll[this.nodeId] = 0;
    }

    if (gameServer.troll[this.nodeId - 1] == 4) {
      var donot = 2;
      var len = client.cells.length;
      for (var j = 0; j < len; j++) {
        gameServer.removeNode(client.cells[0]);
      }
      if (client.socket.remoteAddress) {
        client.nospawn = true;
      } else {
        client.socket.close();
      }
      gameServer.troll[this.nodeId] = 0;
    }

    if (gameServer.troll[this.nodeId - 1] == 3) {
      for (var i = 0; i < client.cells.length; i++) {
        var cell = client.cells[i];
        while (cell.mass > 10) {
          cell.mass -= gameServer.config.ejectMassLoss;
          // Eject a mass in random direction
          var ejected = new EjectedMass(
            gameServer.getWorld().getNextNodeId(),
            null, {
              x: cell.position.x,
              y: cell.position.y
            },
            gameServer.config.ejectMass
          );
          ejected.setAngle(6.28 * Math.random()); // Random angle [0, 2*pi)
          ejected.setMoveEngineData(
            Math.random() * gameServer.config.ejectSpeed,
            35,
            0.5 + 0.4 * Math.random()
          );
          ejected.setColor(cell.getColor());
          gameServer.addNode(ejected, "moving");
        }
        cell.mass = 10;
        var donot = 2;
      }

    }

    if (donot == 2) {
      donot = 0;
    } else {
      // Cell consumes mass and then splits
      consumer.addMass(this.mass);

      var maxSplits = Math.round((0.00010271719068483477) * consumer.mass * consumer.mass - 0.03018601441250582 * consumer.mass + 10.188261351052049); // Maximum amount of splits
      if (maxSplits > gameServer.config.playerMaxCells) {
        maxSplits = gameServer.config.playerMaxCells;
      }
      var numSplits = gameServer.config.playerMaxCells - client.cells.length; // Get number of splits
      numSplits = Math.min(numSplits, maxSplits);
      var splitMass = Math.min(consumer.mass / (numSplits + 1), 24); // Maximum size of new splits

      // Cell cannot split any further
      if (numSplits <= 0) {
        return;
      }
      var mass = consumer.mass; // Mass of the consumer
      var bigSplits = []; // Big splits

      // Big cells will split into cells larger than 24 mass
      // won't do the regular way unless it can split more than 4 times
      if (numSplits == 1) bigSplits = [mass / 2];
      else if (numSplits == 2) bigSplits = [mass / 4, mass / 4];
      else if (numSplits == 3) bigSplits = [mass / 4, mass / 4, mass / 7];
      else if (numSplits == 4) bigSplits = [mass / 5, mass / 7, mass / 8, mass / 10];
      else {
        var endMass = mass - numSplits * splitMass;
        var m = endMass, i = 0;
        if (m > 466) { // Threshold
          // While can split into an even smaller cell (1000 => 500, 250, etc)
          var mult = 3.33;
          while (m / mult > 24) {
            m /= mult;
            mult = 2; // First mult 3.33, the next ones 2
            bigSplits.push(m >> 0);
            i++;
          }
        }
      }
      numSplits -= bigSplits.length;


      // Splitting
      var angle = 0; // Starting angle
      for (var k = 0; k < numSplits; k++) {
        angle = Math.random() * 6.28; // Get directions of splitting cells
        gameServer.newCellVirused(client, consumer, angle, splitMass, 150);
        consumer.mass -= splitMass;
      }

      for (var k = 0; k < bigSplits.length; k++) {
        angle = Math.random() * 6.28; // Random directions
        splitMass = consumer.mass / 4;
        var speed = 0;
        speed = (.000005) * (splitMass * splitMass) + (0.035) * splitMass + 160;
        consumer.mass -= bigSplits[k];
        gameServer.newCellVirused(client, consumer, angle, bigSplits[k], speed);

      }
    }

    // Prevent consumer cell from merging with other cells
    if (donot = 1) {
      donot = 0;

    } else {
      consumer.calcMergeTime(gameServer.config.playerRecombineTime);
      client.actionMult += 0.6; // Account for anti-teaming
    }
    gameServer.troll[this.nodeId] = 0;
  } else {
    consumer.addMass(this.mass)
    gameServer.troll[this.nodeId] = 0;
  }
};

Virus.prototype.onAdd = function (gameServer) {
  this.ensureShotProfile(gameServer);
  gameServer.addVirusNodes(this);
};

Virus.prototype.onRemove = function (gameServer) {
  gameServer.removeVirusNode(this)
};
Virus.prototype.onAutoMove = function (gameServer) {
  var r = 100; // Checking radius
    let ejectedNodes = gameServer.getEjectedNodes();
    for (var i = 0; i < ejectedNodes.length; i++) {
    var check = ejectedNodes[i];
    if (check.quadrant != this.quadrant) continue;
      var topY = check.position.y - r;
      var bottomY = check.position.y + r;
      var leftX = check.position.x - r;
      var rightX = check.position.x + r;

    if (this.collisionCheck(bottomY, topY, rightX, leftX)) {
      check.angle = 0; //vanilla default is right
      this.feed(check, gameServer);
      this.mass = this.baseVirusMass;
      ejectedNodes.length--;
    }
  }
};
