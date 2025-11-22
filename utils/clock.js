let currentTime = 0;

module.exports = currentTime;

module.exports.tick = (time) => {
    currentTime += time;
}


