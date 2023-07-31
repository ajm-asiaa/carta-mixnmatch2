# carta-mixnmatch2
These are the files required for the CARTA Mix 'N Match 2.0 service. It allows developers to quickly test any combination of carta-frontend and carta-backend commit.

It requires Webhooks to be set up in Github so that it will be notified when there are commits made.
If using NGINX and reverse proxy, it will requires configuration blocks added to your NGINX configuration file. 

After making modifications, in the server directory run:
`npm install`
`npm start`

