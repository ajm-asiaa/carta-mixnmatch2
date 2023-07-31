const express = require('express');
var bodyParser = require('body-parser');
var urlencodedParser = bodyParser.urlencoded({ extended: false });
const morgan = require('morgan');
const session = require('express-session');
const helmet = require('helmet');
const uuid = require('uuid');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const logStream = fs.createWriteStream('/tmp/mixnmatch.log', {flags: 'a'});
const { exec } = require('child_process');
const app = express();
const net = require('net');

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(morgan('combined')); // Morgan provides some user browser info for potential telemetry

logStream.on('error', (err) => {
    console.error(`Error writing to the logStream file: ${err}`);
});

app.use(session({
  secret: '<secret>',
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false } /// Change to true when deployed on https?
}));

const basePath = '/var/www/mixnmatch2';
app.use('/mixnmatch2', express.static(`${basePath}`))

// To try and stop new session IDs when each component loads
app.use((req, res, next) => {
res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");

if (!req.url.includes('.css') && !req.url.includes('.js') && !req.url.includes('.png') && !req.url.includes('.jpg')) {
    console.log('session-id', req.session.id);
  }
  next();	
});

app.use((req, res, next) => {
  res.setHeader('X-Session-ID', req.session.id);
  next();
});

let scriptRunnerSessionId = null;
let clients = [];

app.get('/commits-mixnmatch/:repo', (req, res) => {
    let fileName = `${basePath}/${req.params.repo}-commits.json`;

    fs.readFile(fileName, (err, data) => {
        if (err) {
            console.error(err);
            res.sendStatus(500);
            return;
        }

        let commits = data.toString().split('\n').filter(Boolean).map(JSON.parse);

        res.json(commits);
    });
});

app.post('/github-webhook-mixnmatch', (req, res) => {
    console.log('Webhook received!', req.body);

    if (req.body.commits && req.body.commits.length > 0 && req.body.repository) {
        let repoName = req.body.repository.name;
        let fileName = `${basePath}/${repoName}-commits.json`;

        let latestCommit = req.body.commits[req.body.commits.length - 1];
        let commitData = {
            branch: req.body.ref.replace('refs/heads/', ''),
            shortId: latestCommit.id.substring(0, 7),
            timestamp: latestCommit.timestamp,
            built: "0",
            //frontendBuilt: "0",
            //backendBuilt: "0"
        };

        fs.readFile(fileName, (err, data) => {
            if (err) {
                console.error(err);
                res.sendStatus(500);
                return;
            }

            let commits = data.toString().split('\n').filter(Boolean).map(JSON.parse);

            commits.push(commitData);

            let newData = commits.map(JSON.stringify).join('\n');
            fs.writeFile(fileName, newData, err => {
                if (err) {
                    console.error(err);
                    res.sendStatus(500);
                    return;
                }

                res.sendStatus(200);
            });
        });
    } else {
        res.sendStatus(200);

        // If a build job is already running and this client is not the one that started it,
       // send a 'otherUserScriptRunning' event to this client
       if (buildRunnerSessionId && req.session.id !== buildRunnerSessionId) {
          res.write(`data: ${JSON.stringify({message: 'otherUserScriptRunning'})}\n\n`);
           res.flush();
       }
    }
});

let buildQueue = [];
let buildRunnerSessionId = null;
let isBuilding = false;

app.post('/build', urlencodedParser, (req, res) => {	
	const eventSessionId = req.session.id;
    req.session.isProcessInitiator = true;
    console.log('Received build request from session', req.session.id);
    const time = new Date();
    const userIP = req.headers['x-forwarded-for'] || req.ip;
    const frontendCommit = req.body.frontendCommit;
    const backendCommit = req.body.backendCommit;
    console.log(time, userIP, frontendCommit, backendCommit);

    buildQueue.push({req, res, frontendCommit, backendCommit});

    if (!buildRunnerSessionId) {
        startNextBuild();
    }

    res.json({
      message: 'Build request queued',
      sessionId: req.session.id
    });
});

app.get('/status', (req, res) => {
    console.log("Status request received. Building: " + isBuilding);
    console.log("session-id", req.session.id);
    res.json({
        isBuilding: isBuilding,
        sessionId: req.session.id
    });
});


// Currently only allowing one build (a frontend and a backend) at a time due to the overlays appearing
// so maybe this part could be removed/modified.
async function startNextBuild() {
    if (buildQueue.length === 0) {
        // No builds left in the queue
        isBuilding = false;
        return;
    }

    isBuilding = true;  // Set isBuilding to true here

    // Get the next build from the queue
    const {req, res, frontendCommit, backendCommit} = buildQueue.shift();

    // Set the buildRunnerSessionId to the session ID of the current request
    buildRunnerSessionId = req.session.id;

    try {
        // Run the build process
        await startBuildJob(frontendCommit, backendCommit, res);
    } catch (err) {
        console.error(`Error starting build job: ${err}`);
    } finally {
        // Reset buildRunnerSessionId when the build process is complete
        buildRunnerSessionId = null;
        isBuilding = false;

        // Start the next build in the queue
        startNextBuild();
    }
}


function checkPortAvailability(port) {
    return new Promise((resolve, reject) => {
        const server = net.createServer()
            .once('error', err => resolve(false))
            .once('listening', () => server.once('close', () => resolve(true)).close())
            .listen(port);
    });
}

async function findFreePort(start, end) {
    for (let port = start; port <= end; port++) {
        if (await checkPortAvailability(port)) {
            return port;
        }
    }
    throw new Error(`No free port found between ${start} and ${end}`);
}

// Run the build scripts if required, start carta_backend and form the URL
async function startBuildJob(frontendCommit, backendCommit, res) {
    try {
        // Notify all clients that the build job started
        sendEventToAllClients('bashScriptStarted', {});

        // Wait for both frontend and backend build scripts to finish
        await Promise.all([
            buildScript('carta-frontend', frontendCommit),
            buildScript('carta-backend', backendCommit)
        ]);

        // Notify all clients that the build job finished
        sendEventToAllClients('bashScriptFinished', {});


        // Both build scripts finished, find a free port and start the carta_backend
        const port = await findFreePort(5001, 5020);
        console.log(`Found free port: ${port}`);
        console.log('Testing backendCommit:', backendCommit);
        const backendProcess = exec(`${basePath}/backend/${backendCommit}/carta_backend --port ${port} --debug_no_auth --no_browser --idle_timeout 3600 --top_level_folder /scratch/images/ /scratch/images`);
        //const backendProcess = exec(`echo "Testing"`);

        backendProcess.stdout.on('data', (data) => {
            logStream.write(`carta_backend stdout: ${data}`);
        });

        backendProcess.stderr.on('data', (data) => {
            logStream.write(`carta_backend stderr: ${data}`);
        });

        backendProcess.on('exit', (code, signal) => {
            if (signal === 'SIGUSR1') {
                console.log(`backend process exited successfully with signal ${signal}`);
                // Handle successful execution
                buildRunnerSessionId = null;
                // Notify clients that the build job finished
                clients.forEach((clientRes) => {
                    clientRes.write(`data: ${JSON.stringify({message: 'bashScriptFinished'})}\n\n`);
                });
            } else if (code !== 0) {
                console.log(`backend process exited with code ${code}`);

                logStream.write(`Process exited with code: ${code}`);
                res.status(500).send(`Process exited with code: ${code}`);
            } else {
                console.log(`backend process exited without error or signal`);
            }
        });

        // Still using the wss method here. 
	// Wasn't able to use the carta_backend own webserver yet. Maybe due to reverse proxy and NGINX?
        const url = `https://carta.asiaa.sinica.edu.tw/mixnmatch2/frontend/${frontendCommit}/?socketUrl=wss://carta.asiaa.sinica.edu.tw/socket${port}&skipTelemetry=1`;
        console.log(`Generated URL: ${url}`);

        // Notify clients that the build job finished
        clients.forEach((clientRes) => {
       	  clientRes.write(`data: ${JSON.stringify({ url, message: 'bashScriptFinished', sessionId: buildRunnerSessionId })}\n\n`);
	
       //     clientRes.write(`data: ${JSON.stringify({ url })}\n\n`);
        })
    } catch (err) {
        console.error(`Error building frontend and backend: ${err}`);
    }
}



const buildScript = (repo, commit) => {
    return new Promise((resolve, reject) => {
        let fileName = `${basePath}/${repo}-commits.json`;
        
        fs.readFile(fileName, (err, data) => {
            if (err) {
                console.error("Error reading file:", err);
                return reject(err);
            }
        
            let commits = data.toString().split('\n').filter(Boolean).map(JSON.parse);
            const commitToBuild = commits.find(c => c.shortId === commit);
        
            if (commitToBuild && commitToBuild.built === "0") {
                const buildProcess = exec(`./build-${repo}.sh ${commit} > /tmp/mixnmatch-${repo}-${commit}-build.txt 2>&1`);
        
                buildProcess.stdout.on('data', (data) => {
                    logStream.write(`build-${repo}.sh stdout: ${data}`);
                });
        
                buildProcess.stderr.on('data', (data) => {
                    logStream.write(`build-${repo}.sh stderr: ${data}`);
                });

                buildProcess.on('close', (code, signal) => {
                    if (code !== 0) {
                        console.error(`build-${repo}.sh exited with code ${code}`);
                        return reject(new Error(`build-${repo}.sh exited with code ${code}`));
                    } else {
                        console.log(`build-${repo}.sh exited without error or signal`);
                        commitToBuild.built = "1";
    
                        let newData = commits.map(JSON.stringify).join('\n');
                        fs.writeFile(fileName, newData, err => {
                            if (err) {
                                console.error("Error writing file:", err);
                                return reject(err);
                            }

                            console.log(`Updated built status for ${commit}`);
                            resolve();
                        });
                    }
                });
            } else {
                resolve();
            }
        });
    });
};

app.get('/events-mixnmatch', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders(); // This line is important to keep the connection open?

    res.sessionId = req.session.id;

    // Store the connection in the clients array
    clients.push(res);

    // When the connection is closed, remove it from the clients array
    req.on('close', () => {
        clients = clients.filter(client => client !== res);
    });
});

function sendEventToAllClients(event, data) {
    clients.forEach(client =>
        client.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
    );
}



function sendMessageToSession(sessionId, message) {
    const sessionRes = clients.find(clientRes => clientRes.sessionId === sessionId);
    if (sessionRes) {
        sessionRes.write(`data: ${JSON.stringify({message})}\n\n`);
        sessionRes.flush();
    }
}

const port = 5099;
app.listen(port, () => console.log(`App listening at http://localhost:${port}`));

