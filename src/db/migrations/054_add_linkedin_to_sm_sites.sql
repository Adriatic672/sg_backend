INSERT INTO sm_sites (site_id, sm_name, logo, created_on)
VALUES (5, 'linkedin', 'https://cdn.jsdelivr.net/gh/simple-icons/simple-icons/icons/linkedin.svg', NOW())
ON DUPLICATE KEY UPDATE sm_name = sm_name;
