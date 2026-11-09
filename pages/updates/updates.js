const definePage = require('../../services/page');
const releases = require('../../config/releases');

definePage({
  data: { releases: releases.releases }
});
