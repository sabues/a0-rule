/**
* Handler that will be called during the execution of a PostLogin flow.
*
* @param {Event} event - Details about the user and the context in which they are logging in.
* @param {PostLoginAPI} api - Interface whose methods can be used to change the behavior of the login.
* DOMAIN: Source tenant's domain
* CLIENT_ID, CLIENT_SECRET: Source's tenant client for accessing users data
* app_metadata and user_metadata on the source user will be set to the user loging into the target environment.
*/

const axios = require('axios');

exports.onExecutePostLogin = async (event, api) => {
  // only executes for this social connection's list and users without auth0_internal_social_migrated : true
  if ((['google-oauth2'].indexOf(event.connection.strategy) != -1) && (event.user.app_metadata.auth0_internal_social_migrated)) {
    console.log("auth0_internal: ", event.user.app_metadata.auth0_internal_social_migrated);
    return;
  }
  const tokenOptions = {
    method: 'POST',
    url: `https://${event.secrets.DOMAIN}/oauth/token`,
    headers: { 'content-type': 'application/json' },
    data: {
      grant_type: 'client_credentials',
      client_id: event.secrets.CLIENT_ID,
      client_secret: event.secrets.CLIENT_SECRET,
      audience: `https://${event.secrets.DOMAIN}/api/v2/`
    }
  };

  const res = await axios.request(tokenOptions);
  const userID = event.user.user_id;
  const usersOptions = {
    method: 'GET',
    url: `https://${event.secrets.DOMAIN}/api/v2/users/${userID}`,
    headers: {
      'Authorization': `Bearer ${res.data.access_token}`,
      'content-type': 'application/json'
    }
  };

  const src_user = await axios.request(usersOptions);
  console.log('Source User Metadata: ', src_user.data.user_metadata);
  // Update local user's app metadata here
  for (var key in src_user.data.app_metadata){
    api.user.setUserMetadata(key, src_user.data.app_metadata[key]);
  }
  // set flag to avoid duplicate processing
 	api.user.setAppMetadata("auth0_internal_social_migrated", true);

  // Update local user's app metadata here
  for (var key in src_user.data.user_metadata){
    api.user.setUserMetadata(key, src_user.data.user_metadata[key]);
  }
};