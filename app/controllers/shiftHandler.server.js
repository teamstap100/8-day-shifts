'use strict';

var request = require('request');

// How many days in a row is a shift?
const SHIFT_DAY_LENGTH = 4;

// The most recent start dates for the A/B shifts when this was developed.
// These dates are given relative to UTC time, so they're +4 hours to their EDT value.
// (Shifts API only accepts UTC values, so best to start with them)
const START_TIMES = {

    "ADay": new Date("2019-04-06T10:00:00Z"),
    "ANight": new Date("2019-04-06T22:00:00Z"),
    "BDay": new Date("2019-04-10T10:00:00Z"),
    "BNight": new Date("2019-04-10T22:00:00Z"),
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
    this.createShift = function (req, res) {
        var userId = req.body.userId;
        var team = req.body.team;
        var groupId = req.body.groupId;
        var accessToken = req.body.accessToken;
        var daysCount = Number.parseInt(req.body.days);

        var date = START_TIMES[team];
        var dates = [];
        var counter = SHIFT_DAY_LENGTH;  // Number of days in a row per shift
        var on = true;

        for (let i = 0; i < daysCount; i++) {
            console.log(i);
            if (on) {
                if (date < new Date()) {
                    i--;
                } else {
                    dates.push(date);
                }
            }

            date = date.addDays(1);
            counter -= 1;
            if (counter == 0) {
                on = !on;
                counter = SHIFT_DAY_LENGTH;
            }
        }

        let theme;
        if ((team == "ADay") || (team == "ANight")) {
            theme = "darkPink";
        } else {
            theme = "blue";
        }

        let innerShift = {
            displayName: team,
            startDateTime: "2019-04-13T06:00:00",    // dummy timestamps, they will be replaced
            endDateTime: "2019-04-13T18:00:00",
            theme: theme,
        }

        let shift = {
            userId: userId,
            //schedulingGroupId: SCHEDULING_GROUP_IDS[team],
            //sharedShift: innerShift,
            draftShift: innerShift

        };

        dates.forEach(function (date) {
            console.log(date);
        })

        var shiftCounter = 0;

        function checkIfDone() {
            if (shiftCounter == dates.length) {
                console.log("Done now");
                res.status(200).send();
            }
        }

        dates.forEach(function (date) {
            // Account for time zone; toISOString() assumes it's UTC

            var tzoffset = (date.getTimezoneOffset() * 60000);   // offset in milliseconds
            var isoDateStart = (new Date(date + tzoffset)).toISOString();
            var isoDateEnd = (new Date(date.addHours(12) + tzoffset)).toISOString();

            // First we want to query and see if a shift already exists at that exact start/end time for that user.
            var queryShiftUrl = "https://graph.microsoft.com/beta/teams/" + groupId + "/schedule/shifts?$filter=draftShift/startDateTime ge " + isoDateStart + " and draftShift/endDateTime le " + isoDateEnd;

            const getOptions = {
                url: queryShiftUrl,
                headers: {
                    'Authorization': "Bearer " + accessToken,
                }
            }

            request.get(getOptions, function (error, status, response) {
                if (error) { throw error; }
                var preExistingShifts = JSON.parse(response).value;
                if (preExistingShifts) {
                    var shiftExistsForUser = false;
                    preExistingShifts.forEach(function (pes) {
                        // Can't query directly by user in the shifts API, so we have to check for that user here
                        if (pes.userId == userId) {
                            shiftExistsForUser = true;
                            return;
                        }
                    });
                    if (shiftExistsForUser) {
                        console.log("There is already a draft shift");

                        shiftCounter += 1;
                        checkIfDone();
                        return;
                    }

                }

                // Query the existing shared shifts, too
                queryShiftUrl = queryShiftUrl.replace(/draftShift/g, "sharedShift");
                getOptions.url = queryShiftUrl;

                request.get(getOptions, function (error, status, response) {
                    if (error) { throw error; }
                    preExistingShifts = JSON.parse(response).value;
                    if (preExistingShifts) {
                        var sharedShiftExistsForUser = false;
                        preExistingShifts.forEach(function (pes) {
                            if (pes.userId == userId) {
                                sharedShiftExistsForUser = true;
                                return;
                            }
                        })
                        if (sharedShiftExistsForUser) {
                            console.log("There is already a shared shift");

                            shiftCounter += 1;
                            checkIfDone();
                            return;
                        }
                    }

                    console.log("No shift for that user yet");

                    // Create the shift
                    var createShiftUrl = "https://graph.microsoft.com/beta/teams/" + groupId + "/schedule/shifts";

                    // Use time zone aware dates here
                    var tzoffset = (date.getTimezoneOffset() * 60000);   // offset in milliseconds
                    console.log("TZ offset: " + date.getTimezoneOffset());

                    console.log(new Date(date), new Date(date - tzoffset));

                    isoDateStart = (new Date(date + tzoffset)).toISOString();
                    isoDateEnd = (new Date(date.addHours(12) + tzoffset)).toISOString();

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
                        console.log("Response was: " + response);

                        shiftCounter += 1;
                        console.log(shiftCounter, dates.length);
                        checkIfDone();
                        return;
                    });
                })
            })
        })
    };
}

module.exports = shiftHandler;