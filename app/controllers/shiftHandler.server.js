'use strict';

// Each request will retry 5 times (5sec between attempts) if they fail or get a timeout error
var request = require('requestretry');

// How many days in a row is a shift?
// TODO: I don't actually use this at all yet
const SHIFT_DAY_LENGTH = 4;

function daysIntoYear(date) {
    return (Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) - Date.UTC(date.getFullYear(), 0, 0)) / 24 / 60 / 60 / 1000;
}

function dateAorB(date) {
    var mod = daysIntoYear(date) % 8;
    if (mod == 0 || mod > 4) {    // 0, 5, 6, 7
        return "A";
    } else {
        return "B";               // 1, 2, 3, 4
    }
}

// Useful date helper functions
Date.prototype.addDays = function (days) {
    var date = new Date(this.valueOf());
    date.setDate(date.getDate() + days);
    return date;
}

Date.prototype.addHours = function (hours) {
    var date = new Date(this.valueOf());
    date.setHours(date.getHours() + hours);
    return date;
}

function shiftHandler() {
    // Create a series of shifts for a given user and team.
    this.assignShifts = function (req, res) {

        // Fetch all the useful data from the request
        var userId = req.body.userId;
        var team = req.body.team;
        var groupId = req.body.groupId;
        var accessToken = req.body.accessToken;
        var daysCount = Number.parseInt(req.body.days);
        var schedulingGroupId = req.body.schedulingGroupId;

        function getExistingShifts(daysCount, callback) {
            // Get the dates, from today to (today+daysCount), that are in this shift schedule
            var date = new Date()
            date.setHours(0, 0, 0, 0);
            console.log(date);
            var dates = [];
            var segmentsDone = 0;

            // Also get lists of "date segments" (groups of 4 days in this schedule)
            var dateSegments = [];
            var currentSegment = [];

            function checkIfDone() {
                console.log("Segments done: " + segmentsDone + " / " + dateSegments.length);
                if (segmentsDone == dateSegments.length) {
                    console.log("Done now: " + userId + " " + team);
                    res.status(200).json({
                        userId: userId,
                        shift: team
                    });
                }
            }

            for (let i = 0; i < daysCount; i++) {
                if (dateAorB(date) == "A") {
                    if (team == "ADay") {
                        dates.push(date.addHours(6));
                        currentSegment.push(date.addHours(6));
                    } else if (team == "ANight") {
                        dates.push(date.addHours(18));
                        currentSegment.push(date.addHours(18));
                    } else {
                        if (currentSegment.length > 0) {
                            dateSegments.push(currentSegment);
                            currentSegment = [];
                        }
                    }
                } else if (dateAorB(date) == "B") {
                    if (team == "BDay") {
                        dates.push(date.addHours(6));
                        currentSegment.push(date.addHours(6));
                    } else if (team == "BNight") {
                        dates.push(date.addHours(18));
                        currentSegment.push(date.addHours(18));
                    } else {
                        if (currentSegment.length > 0) {
                            dateSegments.push(currentSegment);
                            currentSegment = [];
                        }
                    }
                }
                date = date.addDays(1);
            }

            // Catch the last one
            if (currentSegment.length > 0) {
                dateSegments.push(currentSegment);
            }

            // Get the current shifts assigned in this segment
            dateSegments.forEach(function (seg) {
                // Query all shifts in this timeframe
                // First date in segment
                var isoDateStart = seg[0].toISOString();

                // End-time of last date in segment, so need to add 12 hours
                var isoDateEnd = seg[seg.length-1].addHours(12).toISOString();

                // Current strategy: Get all the 4-day segments that are in this shift, up until the end date.
                // Query each one and figure out if each shift has been assigned yet.

                console.log(isoDateStart, isoDateEnd);

                var queryShiftUrl = "https://graph.microsoft.com/beta/teams/" + groupId + "/schedule/shifts?$filter=draftShift/startDateTime ge " + isoDateStart + " and draftShift/endDateTime le " + isoDateEnd;
                const getOptions = {
                    url: queryShiftUrl,
                    headers: {
                        'Authorization': "Bearer " + accessToken,
                    }
                }

                console.log("Querying the already-existing shifts...");

                request.get(getOptions, function (error, status, response) {
                    if (error) { throw error; }

                    response = JSON.parse(response);

                    if (response["@odata.nextLink"]) {
                        // TODO: Get next page while there is one
                        console.log("There was another page in that query");
                    }

                    var preExistingShifts = response.value;

                    // TODO: Check each shift here to see if it needs to be created

                    var nonRedundantShifts = [];

                    seg.forEach(function (date) {

                        // It really wants to put milliseconds here... gotta do an ugly string split to get it to look for the right thing
                        var isoDateStart = new Date(date).toISOString().split('.')[0] + "Z";
                        var isoDateEnd = new Date(date.addHours(12)).toISOString().split('.')[0] + "Z";

                        console.log("Looking for: " + userId + " " + isoDateStart + " " + isoDateEnd);
                        var shiftsThisUserThisTime = preExistingShifts.filter(function (pes) {
                            return pes.userId == userId &&
                                pes.draftShift.startDateTime == isoDateStart &&
                                pes.draftShift.endDateTime == isoDateEnd;
                        });

                        if (shiftsThisUserThisTime.length > 0) {
                            console.log("This shift already exists");
                        } else {
                            console.log("This shift is new");
                            nonRedundantShifts.push(date);
                        }

                    })
                    if (nonRedundantShifts.length > 0) {
                        console.log("Need to make some shifts");
                        var result = callback(seg, nonRedundantShifts);
                        segmentsDone++;
                        checkIfDone();
                    } else {
                        console.log("All these shifts already exist");
                        segmentsDone++;
                        checkIfDone();
                    }
                });
            })
        }

        function createShifts(dates) {
            var shiftsDone = 0;

            function checkIfDone() {
                console.log("Shifts in this segment done: " + shiftsDone + " / " + dates.length);
                if (shiftsDone == dates.length) {
                    console.log("Done now: " + userId + " " + dates);
                    return {
                        userId: userId,
                        shift: team,
                        dates: dates
                    }
                }
            }

            dates.forEach(function (date) {
                var createShiftUrl = "https://graph.microsoft.com/beta/teams/" + groupId + "/schedule/shifts";

                // Use time zone aware dates here
                var tzoffset = (date.getTimezoneOffset() * 60000);   // offset in milliseconds
                var isoDateStart = (new Date(date + tzoffset)).toISOString();
                var isoDateEnd = (new Date(date.addHours(12) + tzoffset)).toISOString();

                shift.draftShift.startDateTime = isoDateStart;
                shift.draftShift.endDateTime = isoDateEnd;

                const options = {
                    url: createShiftUrl,
                    headers: {
                        'Authorization': "Bearer " + accessToken,
                        'Content-Type': 'application/json',
                        'Accept': "application/json;odata.metadata=minimal;",
                    },
                    body: JSON.stringify(shift)
                };

                request.post(options, function (error, status, response) {
                    if (error) { throw error; }

                    shiftsDone++;
                    checkIfDone();
                    return;
                });
            })
        }

        let theme;
        if ((team == "ADay") || (team == "ANight")) {
            theme = "darkPink";
        } else {
            theme = "blue";
        }

        let innerShift = {
            displayName: team,
            startDateTime: "2019-04-13T06:00:00",    // dummy timestamps, they get replaced
            endDateTime: "2019-04-13T18:00:00",
            theme: theme,
        }

        let shift = {
            userId: userId,
            schedulingGroupId: schedulingGroupId,
            //sharedShift: innerShift,
            draftShift: innerShift

        };

        getExistingShifts(daysCount, createShifts);
    };
}

module.exports = shiftHandler;