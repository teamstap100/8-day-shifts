# 8-Day-Shifts
* Teams tab application written in Node.js/Express which calls the Shifts Graph API to assign shifts in a 4-days-on, 4-days-off rotation.

* The code is largely adapted from the code in (this repo)[https://github.com/microsoftgraph/msgraph-training-nodeexpressapp].
* Silent authentication (so it works in a Teams tab) is based on (this code)[https://docs.microsoft.com/en-us/microsoftteams/platform/concepts/authentication/auth-silent-aad].
* After login is complete, an AJAX Graph API call gets all the team's users. Each one can be assigned a shift.
* Submitting the list of shifts calls a backend function via AJAX; this function is in app/controllers/shiftHandler.server.js.
* Three variables are necessary to define in ./config.js:
	* clientId: Application client id
	* secret: Application client secret
	* x5cstrings: Dictionary where each x5c string is the key and the corresponding x5t string is the value. (See (this link)[https://stevelathrop.net/securing-a-node-js-rest-api-with-azure-ad-jwt-bearer-tokens/])