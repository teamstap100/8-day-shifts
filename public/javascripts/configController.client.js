'use strict';

(function () {

    var contentUrl;
    // TESTING
    //contentUrl = "https://1db7be47.ngrok.io";
    // PRODUCTION
    contentUrl = "https://8-day-shifts.azurewebsites.net/";

    console.log(contentUrl);

    function setValid() {
        console.log("onClick called");
        microsoftTeams.settings.setValidityState(true);
    }

    microsoftTeams.initialize();
    microsoftTeams.settings.registerOnSaveHandler(function (saveEvent) {
        console.log("calling registerOnSaveHandler");
        microsoftTeams.getContext(function (context) {
            var radio = document.getElementById("soManyOptions");
            if (radio.checked) {
                var thisRadioValue = radio.value;
                var teamId = context.teamId;
                console.log(teamId);
                var settings = {
                    entityId: "8-Day Shifts",
                    contentUrl: contentUrl,
                    suggestedDisplayName: "8-Day Shifts",
                }
                console.log(settings);
                microsoftTeams.settings.setSettings(settings);
            }
            saveEvent.notifySuccess();
        })

    });

})();