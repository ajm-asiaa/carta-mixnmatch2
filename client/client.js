document.addEventListener('DOMContentLoaded', (event) => {

let goButton = document.getElementById('go-button');

// First check if the server is occupied building on page load and if so, show the busyOverlay
checkBuildStatusOnLoad();

  function checkBuildStatusOnLoad() {
    fetch('/status')
      .then(response => response.json())
      .then(data => {
          if (data.isBuilding) {
              showOverlay();
              goButton.disabled = true;
              console.log('Server busy');
          }
      })
      .catch((error) => {
          console.error('Error:', error);
      });
  }

// Handle frontend radio button and text input
let frontendRadios = document.querySelectorAll('input[name="frontend-commits"]');
let frontendTextInput = document.getElementById('frontend-commit-input');

 // Listen for frontend radio button activity
 frontendRadios.forEach(radio => {
   radio.addEventListener('click', () => {
     frontendTextInput.value = '';
   });
 });

 // Listen for frontend text input
 frontendTextInput.addEventListener('input', () => {
   frontendRadios.forEach(radio => {
     radio.checked = false;
   });
 });

// Handle backend radio button and text input
let backendRadios = document.querySelectorAll('input[name="backend-commits"]');
let backendTextInput = document.getElementById('backend-commit-input');

 // Listen for backend radio button activity
 backendRadios.forEach(radio => {
  radio.addEventListener('click', () => {
    backendTextInput.value = '';
  });
 });

 // Listen for backend text input 
 backendTextInput.addEventListener('input', () => {
   backendRadios.forEach(radio => {
    radio.checked = false;
  });
 });

// Handle copy & paste into the frontend text box
// Only show 7 characters and cancel any radio button selection.
const frontendInput = document.getElementById('frontend-commit-input');
frontendInput.addEventListener('input', (event) => {
  document.querySelectorAll('input[name="frontend-commits"]').forEach(radio => {
    radio.checked = false;
  });
  if (event.inputType === 'insertFromPaste') {
    event.target.value = event.target.value.slice(0, 7);
  }
});

// Handle copy & paste into the backend text box
// Only show 7 characters and cancel any radio button selection.
const backendInput = document.getElementById('backend-commit-input');
backendInput.addEventListener('input', (event) => {
  document.querySelectorAll('input[name="backend-commits"]').forEach(radio => {
    radio.checked = false;
  });
  if (event.inputType === 'insertFromPaste') {
    event.target.value = event.target.value.slice(0, 7);
  }
});



  // Busy overlays - maybe not necessary to have such basic 1 line functions
  function showOverlay() {
     $('#busyOverlay').show();
  }
  function hideOverlay() {
     $('#busyOverlay').hide();
  }

// To make sure a user enters a valid short commit ID in the text boxes by comparing it with those in the json files
let frontendCommits = [];
let backendCommits = [];

 function fetchCommits(repo) {
  return fetch(`/commits-mixnmatch/${repo}`)
    .then(res => res.json())
    .then(commits => {
      // Store the commit IDs
      if (repo === 'carta-frontend') {
        frontendCommits = commits.map(commit => commit.shortId);
      } else if (repo === 'carta-backend') {
        backendCommits = commits.map(commit => commit.shortId);
      }
      return commits;
    });
 }

 // Format the Github commit time stamp in a more human readable style
function formatTimestamp(timestamp) {
  const date = new Date(timestamp);
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).replace(/(\d+)\/(\d+)\/(\d+),/, "$3-$1-$2");
}

// Prepare commit lists for display
function displayCommits(commits, containerId) {
  const commitsContainer = document.getElementById(containerId);
  commitsContainer.innerHTML = "";

  // Separate out the 'dev' branch commits
  const devCommits = commits.filter(commit => commit.branch === 'dev');

  // Sort the commits in reverse order so the latest commits appear at the top
  commits.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  // Only show the latest 30 commits
  if (commits.length > 30) {
    commits = commits.slice(0, 30);
  }

  // Always display the latest 'dev' commit first
  if (devCommits.length > 0) {
    devCommits.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    displayCommit(devCommits[0], containerId);

    // Add a horizontal line after the first 'dev' commit
    const line = document.createElement("hr");
    commitsContainer.appendChild(line);
  }

// Display all the commits
  commits.forEach((commit) => {
    displayCommit(commit, containerId);
  });
}

function displayCommit(commit, containerId) {
  const commitsContainer = document.getElementById(containerId);

  const commitElement = document.createElement("div");
  commitElement.classList.add("commit-item");

  const radioInput = document.createElement("input");
  radioInput.type = "radio";
  radioInput.name = containerId;
  radioInput.value = commit.shortId;

  const commitInfo = document.createElement("span");
  commitInfo.textContent = `${commit.branch}, ${commit.shortId}, ${formatTimestamp(commit.timestamp)}`;

  // This will clear any text field input if a radio button is checked
  radioInput.addEventListener('click', () => {
    document.getElementById(containerId.replace('commits', 'commit-input')).value = '';
  });

  // Check if the commit was already built and display in bold font if so.
  if (commit.built === "1") {
    commitInfo.style.fontWeight = 'bold';
  }

  // Previous idea to indicate if built. Perhaps could be adapted to show failed builds?
  const builtIndicator = document.createElement("span");
  builtIndicator.classList.add("built-indicator");
  builtIndicator.textContent = commit.built === "1" ? " x" : "";

  commitElement.appendChild(radioInput);
  commitElement.appendChild(commitInfo);
  commitElement.appendChild(builtIndicator);

  commitsContainer.appendChild(commitElement);
}



  // Show commit lists when page loads
     fetchCommits('carta-frontend').then(data => displayCommits(data, 'frontend-commits'));
     fetchCommits('carta-backend').then(data => displayCommits(data, 'backend-commits'));


// Perform actions when user clicks the Go button
let startTime;

document.getElementById('go-button').addEventListener('click', () => {
  let frontendValue = document.querySelector('input[name="frontend-commits"]:checked')?.value;
  let backendValue = document.querySelector('input[name="backend-commits"]:checked')?.value;

  const frontendInputValue = document.getElementById('frontend-commit-input').value;
  const backendInputValue = document.getElementById('backend-commit-input').value;

  if (frontendInputValue && frontendCommits.includes(frontendInputValue)) {
    frontendValue = frontendInputValue;
  }
  if (backendInputValue && backendCommits.includes(backendInputValue)) {
    backendValue = backendInputValue;
  }

  if (!frontendValue || !backendValue) {
    alert('Please select commits or input valid short commit IDs');
    return;
  }

   console.log(`Sending build request for frontend commit ${frontendValue} and backend commit ${backendValue}`);

    document.getElementById('buildOverlay').style.display = 'block';  // Show the build overlay for the user who clicked Go

    // For determing the time between user click and opening the URL.
    // Needed to know if opening a new tab (_blank) will work which only works if commits where previously built
    // because if there is a long delay after the user action, the web browser will not open a new tab.
    startTime = Date.now();

    fetch('/build', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ frontendCommit: frontendValue, backendCommit: backendValue }),
    })
    .then(response => response.json())
    .then(data => {
      url = data.url;

      // Refresh the commit lists
     fetchCommits('carta-frontend').then(data => displayCommits(data, 'frontend-commits'));
     fetchCommits('carta-backend').then(data => displayCommits(data, 'backend-commits'));
    })
    .catch(err => {
      console.error('Error:', err);
    });
  }); // end of 'go-button' click event listener


  // Handle the busy overlay
  const eventSource = new EventSource('/events-mixnmatch');

 // Listen for 'bashScriptStarted' event
 eventSource.addEventListener('bashScriptStarted', function (event) {
    // Show the busy overlay in all sessions (user + other users)
    showOverlay();
    goButton.disabled = true;
 });

 // Listen for 'bashScriptFinished' event
 eventSource.addEventListener('bashScriptFinished', function (event) {
    // Hide the busy overlay in all sessions
    hideOverlay();
    goButton.disabled = false;
     // Refresh commits list
     fetchCommits('carta-frontend').then(data => displayCommits(data, 'frontend-commits'));
     fetchCommits('carta-backend').then(data => displayCommits(data, 'backend-commits'));
    //Hide build overlay for the user who clicked Go
    document.getElementById('buildOverlay').style.display = 'none';
  const eventData = JSON.parse(event.data);

 });



 // We need to know the sessionID of the user who clicked 'Go' so that URL only opens for them and not in other connected sessions.
 let builderSessionId;

    fetch('/status')
        .then(response => response.json())
        .then(data => {
        //console.log('My session ID:', data.sessionId);
        //console.log('Builder session ID:', data.isBuilding);
	builderSessionId = data.sessionId;
            if (data.isBuilding) {
                showOverlay();
                goButton.disabled = true;
            }
        });

eventSource.onmessage = (event) => {
  //console.log('Received event:', event.data);
  const eventData = JSON.parse(event.data);

  // If a URL is provided and the session ID matches, refresh the commit lists and then open the URL
  if (eventData.url && eventData.sessionId === builderSessionId) {
    console.log('OpeningURL');
    // Refresh the commit lists
    Promise.all([
      fetchCommits('carta-frontend').then(data => displayCommits(data, 'frontend-commits')),
      fetchCommits('carta-backend').then(data => displayCommits(data, 'backend-commits'))
    ])
    .then(() => {
      // Calculate the time after user clicked Go
      let duration = Date.now() - startTime;
      console.log('Build duration:', duration);

      // If the duration is less than 1 seconds open the URL in a new tab (_blank), otherwise same tab (_self)
      let target = duration < 1000 ? '_blank' : '_self';
      // Open the URL after the commit lists have been refreshed
      window.open(eventData.url, target);
      // Open in a new tab was problematic. It worked if commits were previously built so that clicking "Go"
      // was an instant response. But it did not work if time was needed to build the commits first.
      // I think it is due to browser popup blocker behaviour.
      // As it needs to wait a few minutes after clicking "Go", the browser doesn't think it is a user action.

    });
  }
};

}); // end of 'DOMContentLoaded' event listener

