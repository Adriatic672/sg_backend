INSERT INTO sm_sites (site_id, sm_name, link, logo)
VALUES (5, 'linkedin', 'linkedin.com', 'https://cdn.jsdelivr.net/gh/simple-icons/simple-icons/icons/linkedin.svg')
ON DUPLICATE KEY UPDATE sm_name = sm_name;
