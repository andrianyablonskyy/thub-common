/**
 * @file        packages/shared/src/index.js
 * @description Public entry point re-exporting shared states, schema, API client and update helpers
 *
 * @author      Andrian Yablonskyy
 * @copyright   Copyright (c) 2026 Andrian Yablonskyy. All rights reserved.
 *
 * This file is part of TestHub and is proprietary and confidential.
 * Unauthorized copying, modification, distribution, or use of this file,
 * via any medium, is strictly prohibited without prior written permission
 * from AdSystem.PRO.
 */

'use strict';

module.exports = {
  ...require('./states'),
  ...require('./validate-job-spec'),
  ...require('./updates'),
  ApiClient: require('./api-client').ApiClient
};
