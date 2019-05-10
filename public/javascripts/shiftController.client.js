'use strict';

(function () {
    var spinner = '<i class="fa fa-spinner fa-spin"></i>  ';

    microsoftTeams.initialize();

    $('#btnLogin').click(login);
    $('#btnLogout').click(logout);

    var userId;
    var groupId;
    var accessToken;
    var userTeamRole;
    microsoftTeams.getContext(function (context) {
        groupId = context["groupId"].split("@")[0];
        userId = context["userObjectId"];
        $('#teamId').text(groupId);
    });

    const clientId = "40115a45-92b0-4c69-85e3-b61d266e7439"; // Client Id of the registered application

    // Parse query parameters
    let queryParams = getQueryParameters();
    let loginHint = queryParams["loginHint"];
    let userObjectId = queryParams["userObjectId"];
    // Use the tenant id of the current organization. For guest users, we want an access token for
    // the tenant we are currently in, not the home tenant of the guest.
    let tenantId = queryParams["tenantId"] || "common";
    // ADAL.js configuration
    let config = {
        tenant: tenantId,
        clientId: clientId,
        redirectUri: window.location.origin + "/auth/silent-end",     // This should be in the list of redirect uris for the AAD app
        cacheLocation: "localStorage",
        navigateToLoginRequestUrl: false,
    };
    // Setup extra query parameters for ADAL
    // - openid and profile scope adds profile information to the id_token
    // - login_hint provides the expected user name
    if (loginHint) {
        config.extraQueryParameter = "scope=openid+profile&login_hint=" + encodeURIComponent(loginHint);
    } else {
        config.extraQueryParameter = "scope=openid+profile";
    }

    let authContext = new AuthenticationContext(config);

    // See if there's a cached user and it matches the expected user
    let user = authContext.getCachedUser();
    if (user) {
        if (user.profile.oid !== userObjectId) {
            // User doesn't match, clear the cache
            authContext.clearCache();
        }
    }

    // Get the id token (which is the access token for resource = clientId)
    let token = authContext.getCachedToken(clientId);
    if (token) {
        showUserInformation(token);
    } else {
        // No token, or token is expired
        // First, verify that we are renewing the right user's token
        if ((user) && (user.profile.oid === userObjectId)) {
            authContext._renewIdToken(function (err, idToken) {
                if (err) {
                    console.log("Renewal failed: " + err);
                    // Failed to get the token silently; show the login button
                    $("#btnLogin").css({ display: "" });
                    // You could attempt to launch the login popup here, but in browsers this could be blocked by
                    // a popup blocker, in which case the login attempt will fail with the reason FailedToOpenWindow.
                } else {
                    showUserInformation(idToken);
                }
            });
        } else {
            // Make the user log in again
            $("#btnLogin").css({ display: "" });
        }
    }
    // To get an access token to a resource like Graph,
    //   1. Provide the resource id to getCachedToken
    //          authContext.getCachedToken("https://graph.microsoft.com")
    //   2. Call _renewToken instead of _renewIdToken
    //          authContext._renewToken("https://graph.microsoft.com", function(err, accessToken) { ... })

    // Login to Azure AD
    function login() {
        $("#divError").text("").css({ display: "none" });
        $("#divProfile").css({ display: "none" });
        $('#divShifts').css({ display: "none" });
        microsoftTeams.authentication.authenticate({
            url: window.location.origin + "/auth/silent-start",
            width: 600,
            height: 535,
            successCallback: function (result) {
                $('#instructions').html(spinner + "Getting your profile...");

                // AuthenticationContext is a singleton
                let authContext = new AuthenticationContext();
                let idToken = authContext.getCachedToken(clientId);
                if (idToken) {
                    showUserInformation(idToken);
                } else {
                    console.error("Error getting cached id token. This should never happen.");
                    // At this point we have to get the user involved, so show the login button
                    $("#btnLogin").css({ display: "" });

                };

                authContext.getCachedToken("https://graph.microsoft.com")
                authContext._renewToken("https://graph.microsoft.com", function (err, aToken) {
                    console.log(err);
                    if (aToken) {
                        accessToken = aToken;

                        // Now do stuff with the accessToken.
                        // First, check if a schedule exists and create one if not
                        createScheduleIfNotExist(accessToken);
                        // This function calls the "get users" function when it's done
                    }
                })

            },
            failureCallback: function (reason) {
                console.log("Login failed: " + reason);
                if (reason === "CancelledByUser" || reason === "FailedToOpenWindow") {
                    console.log("Login was blocked by popup blocker or canceled by user.");
                }
                // At this point we have to get the user involved, so show the login button
                $("#btnLogin").css({ display: "" });
                $("#divError").text(reason).css({ display: "" });
                $("#divProfile").css({ display: "none" });
                $("#divShifts").css({ display: "none" });
            }
        });
    }

    // Validate the provided id_token, and show the user information from claims in the id_token.
    // This demonstrates how you might expose an API that takes the id_token as a user identity claim.
    function showUserInformation(idToken) {
        // The /api/validateToken endpoint takes an id_token in the Authorization header and attempts
        // to validate it as per (https://docs.microsoft.com/en-us/azure/active-directory/develop/active-directory-token-and-claims#idtokens).
        // If successful, it returns the decoded token. Otherwise it return an HTTP 401 Unauthorized response.
        $.ajax({
            url: window.location.origin + "/api/validateToken",
            beforeSend: function (request) {
                request.setRequestHeader("Authorization", "Bearer " + idToken);
            },
            success: function (token) {
                $("#divShifts").css({ display: "" });
                $("#divError").css({ display: "none" });

                // Show the logout button and hide the login button
                $("#btnLogin").css({ display: "none" });
                $("#btnLogout").css({ display: "" });

            },
            error: function (xhr, textStatus, errorThrown) {
                console.log("textStatus: " + textStatus + ", errorThrown:" + errorThrown);
                $("#divError").text(errorThrown).css({ display: "" });
                $("#divProfile").css({ display: "none" });
                $("#divShifts").css({ display: "none" });
            },
        });
    }

    function createScheduleIfNotExist(accessToken) {
        var scheduleUrl = "https://graph.microsoft.com/beta/teams/" + groupId + "/schedule";
        $('#instructions').html(spinner + "Checking schedule...");
        $.ajax({
            type: "GET",
            url: scheduleUrl,
            beforeSend: function (xhr) {
                xhr.setRequestHeader("Authorization", "Bearer " + accessToken);
            },
        }).then(function (data) {
            if (!data.enabled) {
                $('#instructions').html(spinner + "No schedule exists yet for this team. Creating a new blank schedule...");
                var newSchedule = {
                    enabled: true,
                    timeZone: "America/New_York"
                }

                console.log(newSchedule);
                $.ajax({
                    type: "PUT",
                    url: scheduleUrl,
                    contentType: 'application/json',
                    beforeSend: function (xhr) {
                        xhr.setRequestHeader("Authorization", "Bearer " + accessToken);
                    },
                    data: JSON.stringify(newSchedule)
                }).then(function (newSchedule) {
                    console.log(newSchedule);
                    getTeamUsers(accessToken);

                });
            } else {
                getTeamUsers(accessToken);
            }
        });
    }

    function getTeamUsers(accessToken) {
        // Get the user's direct reports
        $('#instructions').html(spinner + "Getting users...")
        var teamUsersUrl = "https://graph.microsoft.com/v1.0/groups/" + groupId + "/members";
        var req = new XMLHttpRequest();

        req.open("GET", teamUsersUrl, false);
        req.setRequestHeader("Authorization", "Bearer " + accessToken);
        req.send();
        var result = JSON.parse(req.responseText);
        var table = document.getElementById("teamUsers");

        // Sort users alphabetically by last name
        var users = result.value.sort((a, b) => (a.surname > b.surname) ? 1 : -1);

        users.forEach(function (user) {
            var newRow = table.insertRow(-1);
            newRow.innerHTML = "<td class='name'>{name}</td><td class='email'>{email}</td><td class='radios'>{radios}</td><td style='display: none' class='userId'>{userId}</td>";
            newRow.innerHTML = newRow.innerHTML.replace("{name}", user.displayName);
            
            newRow.innerHTML = newRow.innerHTML.replace("{email}", user.userPrincipalName.split("@")[0]);

            var radios = '<div class="btn-group btn-group-toggle" data-toggle="buttons"><label class="btn btn-danger"><input type="radio" name="options" id="createShift-ADay-{userId}"> A Day</label><label class="btn btn-danger"><input type="radio" name="options" id="createShift-ANight-{userId}" autocomplete="off"> A Night</label><label class="btn btn-primary"><input type="radio" name="options" id="createShift-BDay-{userId}" autocomplete="off"> B Day</label><label class="btn btn-primary"><input type="radio" name="options" id="createShift-BNight-{userId}" autocomplete="off"> B Night</label><label class="btn btn-outline-dark" style="float: right"><input type="radio" name="options" id="none-none-{userId}"> None</label></div>';

            newRow.innerHTML = newRow.innerHTML.replace("{radios}", radios);
            newRow.innerHTML = newRow.innerHTML.replace(/{userId}/g, user.id);

            newRow.classList.add("userRow");

        });

        $('#shiftForm').css('display', '');
        $('#instructions').text("Select the shifts you'd like to assign.");
        $('#days-form').css('display', '');
        $('#submit').click(submitShifts);
    }

    // Parse query parameters into key-value pairs
    function getQueryParameters() {
        let queryParams = {};
        location.search.substr(1).split("&").forEach(function (item) {
            let s = item.split("="),
                k = s[0],
                v = s[1] && decodeURIComponent(s[1]);
            queryParams[k] = v;
        });
        return queryParams;
    }
    // Demonstrates silent logout - simply clears the loginHint, replaces the value of userObjectId with a dummy value, and reloads the page
    function logout() {

        let url = location.href.split("?")[0] + "?";
        let queryParams = getQueryParameters();
        delete queryParams["loginHint"];
        queryParams["userObjectId"] = "00000000-0000-0000-000000000000";
        for (var k in queryParams) {
            url = url + k + "=" + encodeURIComponent(queryParams[k]) + "&";
            console.log(k);
        }
        location.href = url;
    }

    function submitShifts() {
        console.log("Submitting");
        $('#progress').css('display', '');

        var days = $('#inlineFormDays').val();

        var inputs = [];
        var counter = 0;
        $('.userRow').each(function () {
            var userId = $(this).find('td.userId')[0].textContent;
            var radios = $(this).find('label.active');
            console.log(radios);

            if (radios[0]) {
                var selectedRadio = radios[0].children[0].id;
                var buttonType = selectedRadio.split("-")[0];
                if (buttonType == 'createShift') {
                    var team = selectedRadio.split('-')[1];
                    var obj = {
                        userId: userId,
                        team: team,
                        groupId: groupId,
                        accessToken: accessToken,
                        days: days,
                    };
                    inputs.push(obj);
                }
                // Otherwise it's just a "none" button, so ignore it

            }
            counter++;
            if (counter == $('.userRow').length) {
                addShifts(inputs);
            }
        });
    }

    async function addShifts(requests) {
        $('#submit').prop('disabled', true);
        console.log("Got to addShifts");
        var counter = 0;

        // Deal with the zero case
        if (counter == requests.length) {
            $('#progress').css('display', 'none');
            $('#submit').prop('disabled', false);
            console.log("It's done");
            return;
        }

        requests.forEach(function (request) {
            console.log(request);
            addShift(request, function () {
                counter++;
                var progressPercentage = (counter / requests.length) * 100;
                $('#progressValue').css('width', progressPercentage + "%");
                $('#progressValue').css('aria-valuenow', progressPercentage);
                console.log("counter: " + counter);
                if (counter == requests.length) {
                    $('#progress').css('display', 'none');
                    $('#submit').prop('disabled', false);
                    $('#success').css('display', '');
                    $('label.active').removeClass('active');
                    console.log("It's done");
                }
            });
        })
    }

    async function addShift(shift, callback) {
        var createShiftApi = "/api/shifts";

        ajaxRequest('POST', createShiftApi, shift, function () {
            callback();
            return true;
        });
    }

    function ajaxRequest(method, url, params, callback) {
        var xmlhttp = new XMLHttpRequest();

        xmlhttp.onreadystatechange = function () {
            console.log(xmlhttp.status);
            if (xmlhttp.readyState === 4 && xmlhttp.status === 200) {
                callback(xmlhttp.response);
            }
        };

        xmlhttp.open(method, url, true);
        xmlhttp.setRequestHeader('Content-Type', 'application/json');
        xmlhttp.send(JSON.stringify(params));
    }

})();