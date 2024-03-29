async function migrateSocialProfile(user, context, callback) {
  const debug = true;
  user.app_metadata = user.app_metadata || {};
  user.user_metadata = user.user_metadata || {};

  //only execute for social login
  if (['google-oauth2', 'facebook', 'apple'].indexOf(context.connection) === -1) return callback(null, user, context);
  
  // If we have already migrated user info, don't do it again
  if (user.app_metadata.auth0_internal_social_migrated) return callback(null, user, context);

  let ManagementClient = require("auth0@2.31.0").ManagementClient;

  function getMgmtClient() {
    if (global.M2MClient) {
      console.log("m2mclient from cache");
      return global.M2MClient;
    } else {
      console.log("new m2mclient instance");
      const mngmntClient = new ManagementClient({
        domain: configuration.domain,
        clientId: configuration.clientid,
        clientSecret: configuration.clientsecret,
      });
      global.M2MClient = mngmntClient;
      return mngmntClient;
    }
  }

  function getSrcMgmtClient() {
    if (global.srcM2MClient) {
      console.log("src m2mclient from cache");
      return global.srcM2MClient;
    } else {
      console.log("new src m2mclient instance");
      const mngmntClient = new ManagementClient({
        domain: configuration.src_domain,
        clientId: configuration.src_clientid,
        clientSecret: configuration.src_clientsecret,
      });
      global.srcM2MClient = mngmntClient;
      return mngmntClient;
    }
  }

  let client = getMgmtClient();
  let srcclient = getSrcMgmtClient();

  const config = {
    domain: configuration.domain,
    shadowConnection: 'auth0-internal-' + context.connection,
  };


  const getIdentities = async () => {
    try {
      if (debug) console.log("Searching for users");
      const response = await client.getUsersByEmail(user.email);
      if (debug) console.log("Returned from search");

      let identity = null;
      response.forEach((user) => {
        const shadowIdentity = user.identities.find((identity) => identity.connection === config.shadowConnection);
        if (shadowIdentity)
          identity = user;
      });

      return identity;

    } catch (e) {
      console.log(e);
      callback(`An error ocurred while retrieving identities: ${e}`);
    }
  };

  const getSrcUser = async () => {
    try {
      if (debug) console.log("Searching for src users");
      const response = await srcclient.getUser(user.user_id);
      if (debug) console.log("Returned from search");  
      if (debug) console.log("response from getSrcUser: ", response); 
      if (response.length > 0) {
        // search by id should return one user at the most
        return response[0];
      } else {
        return null;
      }

    } catch (e) {
      console.log(e);
      callback(`An error ocurred while retrieving src user: ${e}`);
    }
  };
  
  const linkAccounts = async (identity) => {
    try {
      const connections = await client.getConnections();
      if (debug) console.log(connections);

      if (connections.length < 1) {
        throw Error('could not find connection required to link user');
      }
      identity.app_metadata = identity.app_metadata || {};

      //if primary connection is not a social connection, we need to get the social connection info to link it to the primary account
      //otherwise, social user is primary and link the shadow connection to it
      if (identity.identities[0].connection !== config.shadowConnection) {
        const connection = connections.find(conn => conn.name === context.connection); // <- social connection detail
        const accountLinkParams = { provider: connection.strategy, user_id: user.user_id, connection_id: connection.id };
        await client.linkUsers(identity.user_id, accountLinkParams);
        context.primaryUser = identity.user_id;
        user.user_id = context.primaryUser;
      } else {
        const connection = connections.find(conn => conn.name === config.shadowConnection); // <- shadow connection detail
        const accountLinkParams = { provider: connection.strategy, user_id: identity.user_id, connection_id: connection.id };
        await client.linkUsers(user.user_id, accountLinkParams);
        context.primaryUser = user.user_id;
      }


      let metaData = {
        "app_metadata": { ...identity.app_metadata, auth0_internal_social_migrated: true },
        "user_metadata": { ...identity.user_metadata }
      };

      //now that the user has a single account, that user id will be the primary
      await client.updateUser({ id: context.primaryUser }, metaData);

      return metaData;

    } catch (e) {
      console.log(e);
      return callback(`Account linking failed with error ${e}`);
    }
  };
  

  try {
    //find corresponding primary and shadow users
    const identity = await getIdentities();
    const src_user = await getSrcUser();

    if (!identity && !src_user) {
      // User not found in shadow database, nor in source tenant
      if (debug) console.log('Must be a new user, no user found in old DB nor in source tenant');
      user.app_metadata.auth0_internal_social_migrated = true;
      await client.updateAppMetadata({ id: user.user_id }, user.app_metadata);
      return callback(null, user, context);
    } else if (identity) {
      // User found in shadow database
      if (debug) console.log("Found matching user");
      const currentMetadata = await linkAccounts(identity);
        //set updated metadata on user so it's accessible in subsequent rules
      user.user_metadata = currentMetadata.user_metadata;
      user.app_metadata = currentMetadata.app_metadata;
      return callback(null, user, context);
    } else if (src_user){
      // User found in source tenant but not in shadow database. Update app_metadata and user_metadata from source user
      if (debug) console.log("Updating metadata from source user", src_user);
      let metaData = {
        "app_metadata": { ...src_user.app_metadata, auth0_internal_social_migrated: true },
        "user_metadata": { ...src_user.user_metadata }
      };
      await client.updateUser({id: user.user_id}, metaData);
      return callback(null, user, context);
    }

  }
  catch (e) {
    console.log(e);
    return callback(e);
  }
}